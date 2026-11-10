import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import { exec } from 'child_process';
import readline from 'readline';
import axios from 'axios';
import AdmZip from 'adm-zip';

const BOT_NAME = "Luna Bot";
const BOT_VERSION = "1.1.7";
const BOT_OWNER = "Benjamin";
const BOT_AVATAR = "https://github.com/ipiafernando3-debug/Luna-Bot/blob/main/LunaBot.jpg"; 
const CHANNEL_LINK = "https://whatsapp.com/channel/0029VbE6xIIJP20w9b02kz1p";
const CHANNEL_JID = "120363381484218941@newsletter";

const nsfwStatus = {}; 
const botStatus = {}; 
const userProfiles = {}; 

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

function downloadMediaWithYtDlp(url, outputPath, format = 'mp4') {
    return new Promise(async (resolve, reject) => {
        const isDirect = /\.(mp4|webm|mov|mkv|m3u8|mp3)(\?|$)/i.test(url);
        if (isDirect) {
            exec(`curl -L -s -A "Mozilla/5.0" --max-time 120 -o "${outputPath}" "${url}"`, (err) => {
                if (!err && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
                    return resolve(outputPath);
                }
                tryYtDlp();
            });
            return;
        }
        tryYtDlp();

        function tryYtDlp() {
            let flag = format === 'mp3'
                ? '-x --audio-format mp3 --audio-quality 0'
                : '-f "bv+ba/b" --merge-output-format mp4 --remux-video mp4';
            
            const command = `yt-dlp --no-check-certificate --geo-bypass --no-playlist --add-header "User-Agent:Mozilla/5.0" --add-header "Referer:${url}" ${flag} -o "${outputPath}" "${url}"`;
            
            exec(command, { maxBuffer: 1024 * 1024 * 500 }, (error) => {
                if (fs.existsSync(outputPath)) return resolve(outputPath);
                const files = fs.readdirSync('./').filter(f => f.startsWith('temp_dx_') || f.startsWith('temp_'));
                if (files.length > 0) return resolve('./' + files[0]);
                if (error) reject(error);
                else reject(new Error("El archivo no se generó."));
            });
        }
    });
}

async function safeFetchJson(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) return await res.json();
    } catch (e) {}
    return null;
}

async function fetchActionGifUrl(action, isNsfw = false) {
    if (isNsfw) {
        const purrMap = {
            'blowjob': 'https://purrbot.site/api/img/nsfw/blowjob/gif',
            'cum': 'https://purrbot.site/api/img/nsfw/cum/gif',
            'trap': 'https://purrbot.site/api/img/nsfw/trap/gif',
            'fuck': 'https://purrbot.site/api/img/nsfw/fuck/gif',
            'kiss': 'https://purrbot.site/api/img/nsfw/kiss/gif'
        };

        if (purrMap[action]) {
            const dataPurr = await safeFetchJson(purrMap[action]);
            if (dataPurr && !dataPurr.error && dataPurr.link) return dataPurr.link;
        }

        const nsfwCategories = {
            'blowjob': 'blowjob',
            'trap': 'trap',
            'cum': 'waifu',
            'kiss': 'neko',
            'nsfw_kiss': 'neko'
        };
        const cat = nsfwCategories[action] || 'waifu';
        const dataWaifu = await safeFetchJson(`https://api.waifu.pics/nsfw/${cat}`);
        if (dataWaifu && dataWaifu.url) return dataWaifu.url;

        return "https://api.waifu.pics/nsfw/waifu";
    } else {
        const dataNekos = await safeFetchJson(`https://nekos.best/api/v2/${action}`);
        if (dataNekos && dataNekos.results && dataNekos.results[0]?.url) {
            return dataNekos.results[0].url;
        }

        const dataWaifu = await safeFetchJson(`https://api.waifu.pics/sfw/${action}`);
        if (dataWaifu && dataWaifu.url) return dataWaifu.url;

        return `https://api.waifu.pics/sfw/${action === 'hit' ? 'slap' : (action || 'hug')}`;
    }
}

async function sendGifAction(sock, from, m, action, isNsfw, captionText, mentionedJid) {
    const timestamp = Date.now();
    const tempRaw = `./temp_raw_${timestamp}`;
    const tempMp4 = `./temp_gif_${timestamp}.mp4`;

    try {
        const gifUrl = await fetchActionGifUrl(action, isNsfw);
        
        await new Promise((resolve, reject) => {
            exec(`curl -L -s -o "${tempRaw}" "${gifUrl}"`, (err) => {
                if (err || !fs.existsSync(tempRaw)) reject(err);
                else resolve();
            });
        });

        await new Promise((resolve, reject) => {
            exec(`ffmpeg -i "${tempRaw}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -f mp4 "${tempMp4}" -y`, (err) => {
                if (!err && fs.existsSync(tempMp4)) resolve();
                else reject(err);
            });
        });

        await sock.sendMessage(from, { 
            video: fs.readFileSync(tempMp4), 
            gifPlayback: true, 
            mimetype: 'video/mp4',
            caption: captionText, 
            contextInfo: { mentionedJid: mentionedJid.length > 0 ? mentionedJid : [] } 
        }, { quoted: m });

    } catch (e) {
        await sock.sendMessage(from, { text: captionText, contextInfo: { mentionedJid } }, { quoted: m });
    } finally {
        if (fs.existsSync(tempRaw)) fs.unlinkSync(tempRaw);
        if (fs.existsSync(tempMp4)) fs.unlinkSync(tempMp4);
    }
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        logger: pino({ level: 'silent' })
    });

    if (!sock.authState.creds.registered) {
        console.log('\n📱 Iniciando primera vinculación de sesión...');
        const phoneNumber = await question('👉 Ingresa tu número de WhatsApp con código de país (ejemplo: 573001234567): ');
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
        
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(cleanNumber);
                console.log(`\n🔑 Tu código de vinculación para WhatsApp es: \x1b[32m${code}\x1b[0m\n`);
                console.log('Ingresa este código en WhatsApp -> Dispositivos vinculados -> Vincular con el número de teléfono.\n');
            } catch (err) {
                console.error('❌ Error al solicitar el código de vinculación:', err);
            }
        }, 3000);
    } else {
        console.log('\n🔄 Sesión previa detectada. Conectando a WhatsApp directamente...');
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                connectToWhatsApp();
            } else {
                console.log('❌ Sesión cerrada por WhatsApp.');
            }
        } else if (connection === 'open') {
            console.log(`\n¡${BOT_NAME} v${BOT_VERSION} está en línea y conectada permanentemente! ✅\n`);
            
            try {
                const updateMessage = `🚀 *¡${BOT_NAME} se ha actualizado a la Versión ${BOT_VERSION}!* 💚\n\n✨ Novedades:\n• Restauración completa de todos los comandos (Stickers, Capital, Perfil, YouTube/TikTok, etc.).\n• Corrección definitiva del avatar de Luna.\n\nSigue el canal oficial: ${CHANNEL_LINK}`;
                await sock.sendMessage(CHANNEL_JID, { text: updateMessage });
            } catch (e) {
                console.log("ℹ️ Conectado. (Aviso de actualización preparado para el canal).");
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        const from = m.key.remoteJid;
        const senderId = m.key.participant || from;

        const messageType = Object.keys(m.message)[0];
        const body = messageType === 'conversation' 
            ? m.message.conversation 
            : messageType === 'extendedTextMessage' 
            ? m.message.extendedTextMessage.text 
            : messageType === 'imageMessage'
            ? m.message.imageMessage.caption || ''
            : messageType === 'videoMessage'
            ? m.message.videoMessage.caption || ''
            : '';

        if (botStatus[from] === false) {
            if (body.toLowerCase() === '.bot on') {
                botStatus[from] = true;
                await sock.sendMessage(from, { text: `🟢 ¡${BOT_NAME} ha sido encendida y está operativa nuevamente!` }, { quoted: m });
            }
            return;
        }

        if (body.startsWith('.') || body.startsWith('!')) {
            const args = body.slice(1).trim().split(/ +/);
            const command = args.shift().toLowerCase();
            const query = args.join(' ');
            const mentionedJid = m.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

            switch (command) {
                case 'help':
                case 'menu':
                    const menuText = `🐱 *Menú Principal de ${BOT_NAME} v${BOT_VERSION}*\n` +
                                     `💚 *Mascota:* Luna (Chica de cabello verde)\n\n` +
                                     `⚙️ *General*\n` +
                                     `  • \`.BotEdit\` | \`.bot on / off\`\n` +
                                     `  • \`.SetBotImage\` | \`.girl\`\n\n` +
                                     `🤖 *SubBot*\n` +
                                     `  • \`.code [número]\`\n\n` +
                                     `📷 *Multimedia & APK*\n` +
                                     `  • \`.sticker / .s\` (Envía o responde a foto/video)\n` +
                                     `  • \`.apk [enlace de descarga]\`\n\n` +
                                     `👤 *Perfil*\n` +
                                     `  • \`.join\` | \`.out\` | \`.perfil [Nombre] [Edad]\` | \`.coins\`\n\n` +
                                     `✨ *Acciones SFW*\n` +
                                     `  • \`.kiss\` | \`.hug\` | \`.pat\` | \`.slap\` | \`.dance\` | \`.cry\` | \`.poke\` | \`.hit\`\n\n` +
                                     `📥 *Download*\n` +
                                     `  • \`.yt [link]\` | \`.mp3 [link]\` | \`.tt [link]\` | \`.fb [link]\`\n\n` +
                                     `💰 *Capital*\n` +
                                     `  • \`.work\` | \`.bet\` | \`.crime\` | \`.daily\`\n\n` +
                                     `🔞 *NSFW & Acciones Adultas*\n` +
                                     `  • \`.nsfw on / off\`\n` +
                                     `  • \`.downloadX [enlace]\`\n` +
                                     `  • \`.pack [término]\` (Ej: .pack megumin)\n` +
                                     `  • \`.trap\` | \`.blowjob\` | \`.cum\` | \`.nsfw_kiss\`\n\n` +
                                     `📢 *Canal Oficial*\n` +
                                     `  • ${CHANNEL_LINK}`;

                    await sock.sendMessage(from, { image: { url: BOT_AVATAR }, caption: menuText }, { quoted: m });
                    break;

                case 'sticker':
                case 'stiker':
                case 's':
                    const quotedMsg = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    const isMedia = messageType === 'imageMessage' || messageType === 'videoMessage';
                    const isQuotedMedia = quotedMsg && (quotedMsg.imageMessage || quotedMsg.videoMessage);

                    if (!isMedia && !isQuotedMedia) {
                        await sock.sendMessage(from, { text: 'ℹ️ *Uso del comando .sticker:*\n\nDebes enviar una imagen/video con la leyenda `.sticker` o responder a una imagen/video existente con `.sticker` o `.s`.' }, { quoted: m });
                        break;
                    }

                    await sock.sendMessage(from, { text: '⏳ Creando sticker...' }, { quoted: m });
                    try {
                        let targetMsg = isQuotedMedia ? { message: quotedMsg } : m;
                        const buffer = await downloadMediaMessage(
                            targetMsg,
                            'buffer',
                            {},
                            { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
                        );

                        const tempIn = `./temp_${Date.now()}.bin`;
                        const tempOut = `./temp_${Date.now()}.webp`;
                        fs.writeFileSync(tempIn, buffer);

                        exec(`ffmpeg -i "${tempIn}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512" -vcodec libwebp -lossless 1 -qscale:v 80 -an -vsync 0 "${tempOut}"`, async (err) => {
                            if (!err && fs.existsSync(tempOut)) {
                                await sock.sendMessage(from, { sticker: fs.readFileSync(tempOut) }, { quoted: m });
                                fs.unlinkSync(tempOut);
                            } else {
                                await sock.sendMessage(from, { sticker: buffer }, { quoted: m });
                            }
                            if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                        });
                    } catch (e) {
                        await sock.sendMessage(from, { text: '❌ Error al procesar el sticker.' }, { quoted: m });
                    }
                    break;

                case 'apk':
                    if (!query || !query.startsWith('http')) {
                        await sock.sendMessage(from, { text: 'ℹ️ *Uso del comando .apk:*\n\nEscribe el comando seguido del enlace directo de la APK.' }, { quoted: m });
                        break;
                    }
                    await sock.sendMessage(from, { text: '📥 Descargando archivo APK...' }, { quoted: m });
                    const tempApk = `./temp_apk_${Date.now()}.apk`;
                    try {
                        exec(`curl -L -o "${tempApk}" "${query}"`, async (error) => {
                            if (error || !fs.existsSync(tempApk)) {
                                await sock.sendMessage(from, { text: '❌ No se pudo descargar el APK.' }, { quoted: m });
                                return;
                            }
                            await sock.sendMessage(from, { 
                                document: fs.readFileSync(tempApk), 
                                mimetype: 'application/vnd.android.package-archive', 
                                fileName: 'LunaApp.apk', 
                                caption: '✅ ¡APK descargado con éxito por Luna Bot!' 
                            }, { quoted: m });
                            fs.unlinkSync(tempApk);
                        });
                    } catch (e) {
                        if (fs.existsSync(tempApk)) fs.unlinkSync(tempApk);
                        await sock.sendMessage(from, { text: '❌ Error al procesar el APK.' }, { quoted: m });
                    }
                    break;

                case 'yt':
                    if (!query || !query.startsWith('http')) {
                        await sock.sendMessage(from, { text: 'ℹ️ *Uso del comando .yt:*\n\nEscribe `.yt` seguido del enlace de YouTube.' }, { quoted: m });
                        break;
                    }
                    await sock.sendMessage(from, { text: '📥 Descargando video de YouTube...' }, { quoted: m });
                    const tempYt = `./temp_yt_${Date.now()}.mp4`;
                    try {
                        await downloadMediaWithYtDlp(query, tempYt, 'mp4');
                        await sock.sendMessage(from, { video: fs.readFileSync(tempYt), mimetype: 'video/mp4', caption: '✅ Video descargado.' }, { quoted: m });
                        fs.unlinkSync(tempYt);
                    } catch (e) {
                        if (fs.existsSync(tempYt)) fs.unlinkSync(tempYt);
                        await sock.sendMessage(from, { text: '❌ Error al descargar de YouTube.' }, { quoted: m });
                    }
                    break;

                case 'mp3':
                    if (!query || !query.startsWith('http')) {
                        await sock.sendMessage(from, { text: 'ℹ️ *Uso del comando .mp3:*\n\nEscribe `.mp3` seguido del enlace.' }, { quoted: m });
                        break;
                    }
                    await sock.sendMessage(from, { text: '🎵 Extrayendo audio...' }, { quoted: m });
                    const tempMp3 = `./temp_audio_${Date.now()}.mp3`;
                    try {
                        await downloadMediaWithYtDlp(query, tempMp3, 'mp3');
                        await sock.sendMessage(from, { audio: fs.readFileSync(tempMp3), mimetype: 'audio/mp4', ptt: false }, { quoted: m });
                        fs.unlinkSync(tempMp3);
                    } catch (e) {
                        if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
                        await sock.sendMessage(from, { text: '❌ Error al procesar el audio.' }, { quoted: m });
                    }
                    break;

                case 'tt':
                    if (!query || !query.startsWith('http')) {
                        await sock.sendMessage(from, { text: 'ℹ️ *Uso del comando .tt:*\n\nEscribe `.tt` seguido del enlace de TikTok.' }, { quoted: m });
                        break;
                    }
                    await sock.sendMessage(from, { text: '📥 Descargando TikTok...' }, { quoted: m });
                    const tempTt = `./temp_tt_${Date.now()}.mp4`;
                    try {
                        await downloadMediaWithYtDlp(query, tempTt, 'mp4');
                        await sock.sendMessage(from, { video: fs.readFileSync(tempTt), mimetype: 'video/mp4', caption: '✅ TikTok enviado.' }, { quoted: m });
                        fs.unlinkSync(tempTt);
                    } catch (e) {
                        if (fs.existsSync(tempTt)) fs.unlinkSync(tempTt);
                        await sock.sendMessage(from, { text: '❌ Error al descargar de TikTok.' }, { quoted: m });
                    }
                    break;

                case 'fb':
                    if (!query || !query.startsWith('http')) {
                        await sock.sendMessage(from, { text: 'ℹ️ *Uso del comando .fb:*\n\nEscribe `.fb` seguido del enlace de Facebook.' }, { quoted: m });
                        break;
                    }
                    await sock.sendMessage(from, { text: '📥 Descargando de Facebook...' }, { quoted: m });
                    const tempFb = `./temp_fb_${Date.now()}.mp4`;
                    try {
                        await downloadMediaWithYtDlp(query, tempFb, 'mp4');
                        await sock.sendMessage(from, { video: fs.readFileSync(tempFb), mimetype: 'video/mp4', caption: '✅ Video de Facebook enviado.' }, { quoted: m });
                        fs.unlinkSync(tempFb);
                    } catch (e) {
                        if (fs.existsSync(tempFb)) fs.unlinkSync(tempFb);
                        await sock.sendMessage(from, { text: '❌ Error al descargar de Facebook.' }, { quoted: m });
                    }
                    break;

                case 'code':
                    if (!query) {
                        await sock.sendMessage(from, { text: 'ℹ️ *Uso del comando .code:*\n\nIngresa el número con su código de país sin espacios ni el signo +.\n\n👉 Ejemplo: `.code 573001234567`' }, { quoted: m });
                        break;
                    }
                    const targetPhone = query.replace(/[^0-9]/g, '');
                    await sock.sendMessage(from, { text: `⏳ Generando código para *${targetPhone}*...` }, { quoted: m });
                    try {
                        const pairingCode = await sock.requestPairingCode(targetPhone);
                        await sock.sendMessage(from, { text: `🔑 *Código:* \`${pairingCode}\`` }, { quoted: m });
                    } catch (e) {
                        await sock.sendMessage(from, { text: '❌ Error al generar el código.' }, { quoted: m });
                    }
                    break;

                case 'bot':
                    const estadoArg = args[0]?.toLowerCase();
                    if (estadoArg === 'off') {
                        botStatus[from] = false;
                        await sock.sendMessage(from, { text: `🔴 El bot ha sido *apagado* en este chat.` }, { quoted: m });
                    } else if (estadoArg === 'on') {
                        botStatus[from] = true;
                        await sock.sendMessage(from, { text: `🟢 ¡El bot está *encendido*!` }, { quoted: m });
                    } else {
                        await sock.sendMessage(from, { text: 'ℹ️ *Uso del comando .bot:*\n\nEscribe `.bot on` para encenderlo o `.bot off` para apagarlo en el chat.' }, { quoted: m });
                    }
                    break;

                case 'kiss':
                case 'hug':
                case 'pat':
                case 'slap':
                case 'dance':
                case 'cry':
                case 'poke':
                case 'hit':
                    const targetUser = mentionedJid[0] ? `@${mentionedJid[0].split('@')[0]}` : 'alguien';
                    await sendGifAction(sock, from, m, command, false, `✨ Acción *${command.toUpperCase()}* hacia${targetUser}.`, mentionedJid);
                    break;

                case 'trap':
                case 'blowjob':
                case 'cum':
                case 'nsfw_kiss':
                case 'pack':
                    if (!nsfwStatus[from]) {
                        await sock.sendMessage(from, { text: '🔒 *Acceso Denegado:* El modo NSFW está desactivado. Usa `.nsfw on` para activarlo.' }, { quoted: m });
                        break;
                    }

                    if (command === 'pack') {
                        await sock.sendMessage(from, { text: '📦 Generando pack NSFW (de 5 a 10 imágenes)... Por favor espera un momento.' }, { quoted: m });
                        
                        const timestamp = Date.now();
                        const packDir = `./temp_pack_${timestamp}`;
                        const zipPath = `./pack_${timestamp}.zip`;
                        
                        if (!fs.existsSync(packDir)) fs.mkdirSync(packDir);

                        try {
                            const archiverModule = await import('archiver');
                            const archiver = archiverModule.default || archiverModule;
                            
                            const count = Math.floor(Math.random() * 6) + 5; 
                            const categories = ['waifu', 'neko', 'trap', 'blowjob'];
                            let downloadedCount = 0;

                            for (let i = 0; i < count; i++) {
                                const randomCat = categories[Math.floor(Math.random() * categories.length)];
                                const data = await safeFetchJson(`https://api.waifu.pics/nsfw/${randomCat}`);
                                
                                if (data && data.url) {
                                    const imgPath = `${packDir}/img_${i + 1}.jpg`;
                                    await new Promise((resolve) => {
                                        exec(`curl -L -s -o "${imgPath}" "${data.url}"`, () => {
                                            if (fs.existsSync(imgPath)) downloadedCount++;
                                            resolve();
                                        });
                                    });
                                }
                            }

                            if (downloadedCount < 3) {
                                await sock.sendMessage(from, { text: '❌ No se pudieron descargar suficientes imágenes para el pack. Inténtalo de nuevo.' }, { quoted: m });
                                break;
                            }

                            await new Promise((resolve, reject) => {
                                const output = fs.createWriteStream(zipPath);
                                const archive = archiver('zip', { zlib: { level: 9 } });

                                output.on('close', () => resolve());
                                archive.on('error', (err) => reject(err));

                                archive.pipe(output);
                                archive.directory(packDir, false);
                                archive.finalize();
                            });

                            await sock.sendMessage(from, { 
                                document: fs.readFileSync(zipPath), 
                                mimetype: 'application/zip', 
                                fileName: `Luna_NSFW_Pack_${downloadedCount}imgs.zip`, 
                                caption: `🔞 ¡Aquí tienes tu pack NSFW con ${downloadedCount} imágenes exclusivas!` 
                            }, { quoted: m });

                        } catch (e) {
                            await sock.sendMessage(from, { text: '❌ Ocurrió un error al empaquetar las imágenes.' }, { quoted: m });
                        } finally {
                            try {
                                if (fs.existsSync(packDir)) fs.rmSync(packDir, { recursive: true, force: true });
                                if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
                            } catch (err) {}
                        }
                        break;
                    }

                    const nsfwAction = command === 'nsfw_kiss' ? 'kiss' : command;
                    const targetNsfwUser = mentionedJid[0] ? `@${mentionedJid[0].split('@')[0]}` : 'alguien';
                    await sendGifAction(sock, from, m, nsfwAction, true, `🔞 Acción adulta *${command.toUpperCase()}* hacia${targetNsfwUser}.`, mentionedJid);
                    break;

                case 'nsfw':
                    const subCommand = args[0]?.toLowerCase();
                    if (subCommand === 'on' || subCommand === 'off') {
                        nsfwStatus[from] = (subCommand === 'on');
                        await sock.sendMessage(from, { text: `🔞 Modo NSFW *${subCommand === 'on' ? 'ACTIVADO' : 'DESACTIVADO'}*` }, { quoted: m });
                    } else {
                        await sock.sendMessage(from, { text: 'ℹ️ *Uso del comando .nsfw:*\n\nEscribe `.nsfw on` para activarlo o `.nsfw off` para desactivarlo.' }, { quoted: m });
                    }
                    break;

                // ============ DOWNLOADX CORREGIDO ============
                case 'downloadx':
                    if (!nsfwStatus[from]) {
                        await sock.sendMessage(from, { text: '🔒 *Acceso Denegado:* Modo NSFW desactivado.' }, { quoted: m });
                        break;
                    }
                    if (!query || !query.startsWith('http')) {
                        await sock.sendMessage(from, { text: 'ℹ️ *Uso del comando .downloadX:*\n\nEscribe `.downloadX` seguido del enlace a descargar.\n\n👉 Ejemplo: `.downloadX https://sitio.com/video.mp4`' }, { quoted: m });
                        break;
                    }
                    await sock.sendMessage(from, { text: '📥 Descargando contenido...' }, { quoted: m });
                    const tempDx = `./temp_dx_${Date.now()}.mp4`;
                    try {
                        await downloadMediaWithYtDlp(query, tempDx, 'mp4');
                        
                        if (!fs.existsSync(tempDx) || fs.statSync(tempDx).size < 1000) throw new Error("Archivo vacío");
                        
                        const sizeMB = fs.statSync(tempDx).size / (1024 * 1024);
                        if (sizeMB > 60) {
                            await sock.sendMessage(from, { 
                                document: fs.readFileSync(tempDx), 
                                mimetype: 'video/mp4', 
                                fileName: `video_${Date.now()}.mp4`, 
                                caption: '🔞 Video descargado (como documento por peso).' 
                            }, { quoted: m });
                        } else {
                            await sock.sendMessage(from, { video: fs.readFileSync(tempDx), mimetype: 'video/mp4', caption: '🔞 Video descargado.' }, { quoted: m });
                        }
                        fs.unlinkSync(tempDx);
                    } catch (e) {
                        console.log("Error downloadX:", e.message);
                        if (fs.existsSync(tempDx)) fs.unlinkSync(tempDx);
                        await sock.sendMessage(from, { text: '❌ Error al procesar el enlace. Prueba con el link directo que termine en .mp4' }, { quoted: m });
                    }
                    break;

                case 'girl':
                    await sock.sendMessage(from, { 
                        image: { url: BOT_AVATAR }, 
                        caption: `💚 *Luna* - Tu chica de cabello verde favorita y mascota oficial de ${BOT_NAME} v${BOT_VERSION}.` 
                    }, { quoted: m });
                    break;

                case 'join':
                    if (userProfiles[senderId]) {
                        await sock.sendMessage(from, { text: `⚠️ Ya tienes perfil creado. Usa \`.perfil\`` }, { quoted: m });
                    } else {
                        userProfiles[senderId] = { name: 'Usuario', age: 18, coins: 100 };
                        await sock.sendMessage(from, { text: `🎉 ¡Perfil creado! +100 🪙 de bono.` }, { quoted: m });
                    }
                    break;

                case 'perfil':
                    if (!userProfiles[senderId]) userProfiles[senderId] = { name: 'Usuario', age: 18, coins: 100 };
                    if (args.length >= 2) {
                        userProfiles[senderId].name = args[0];
                        userProfiles[senderId].age = parseInt(args[1]) || 18;
                        await sock.sendMessage(from, { text: `✅ Perfil actualizado:\n👤 Nombre: *${userProfiles[senderId].name}*\n🎂 Edad: *${userProfiles[senderId].age}*` }, { quoted: m });
                    } else {
                        const p = userProfiles[senderId];
                        await sock.sendMessage(from, { text: `👤 *Perfil*\n• Nombre: ${p.name}\n• Edad: ${p.age}\n• Monedas: ${p.coins} 🪙\n\n_Para editar usa:_ \`.perfil [Nombre] [Edad]\`` }, { quoted: m });
                    }
                    break;

                case 'work':
                case 'daily':
                case 'crime':
                    if (!userProfiles[senderId]) userProfiles[senderId] = { name: 'Usuario', age: 18, coins: 100 };
                    const earnings = Math.floor(Math.random() * 200) + 50;
                    userProfiles[senderId].coins += earnings;
                    await sock.sendMessage(from, { text: `💰 ¡Has ganado *+${earnings} 🪙* con \`.${command}\`!\nTotal en capital: *${userProfiles[senderId].coins} 🪙*` }, { quoted: m });
                    break;

                case 'ping':
                    await sock.sendMessage(from, { text: `¡Pong! 🏓 Luna Bot v${BOT_VERSION} activa.` }, { quoted: m });
                    break;

                default:
                    break;
            }
        }
    });
}

connectToWhatsApp();
