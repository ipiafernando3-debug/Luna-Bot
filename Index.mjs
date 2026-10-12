import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import { exec } from 'child_process';
import readline from 'readline';

const BOT_NAME = "Luna Bot";
const BOT_VERSION = "1.0.7";
const BOT_OWNER = "Benjamin";
const BOT_AVATAR = "https://i.imgur.com/v8ZpM0M.jpeg"; // Chica anime de cabello verde (Luna)
const CHANNEL_LINK = "https://whatsapp.com/channel/0029VbE6xIIJP20w9b02kz1p";
const CHANNEL_JID = "120363381484218941@newsletter"; // Canal oficial para avisar actualizaciones (o ajusta según tu JID de canal)

const nsfwStatus = {}; 
const botStatus = {}; 
const userProfiles = {}; 

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

function downloadMediaWithYtDlp(url, outputPath, format = 'mp4') {
    return new Promise((resolve, reject) => {
        let flag = format === 'mp3' ? '-x --audio-format mp3' : '-f "b/bv+ba"';
        const command = `yt-dlp --no-check-certificate --geo-bypass ${flag} -o "${outputPath}" "${url}"`;
        
        exec(command, { maxBuffer: 1024 * 1024 * 150 }, (error, stdout, stderr) => {
            if (error) reject(error);
            else fs.existsSync(outputPath) ? resolve(outputPath) : reject(new Error("El archivo no se generó."));
        });
    });
}

async function fetchActionGifUrl(action, isNsfw = false) {
    try {
        let endpoint = isNsfw ? `https://api.waifu.pics/nsfw/${action}` : `https://api.waifu.pics/sfw/${action}`;
        const response = await fetch(endpoint);
        const data = await response.json();
        if (data && data.url) return data.url;
    } catch (e) {}
    
    // Fallback seguro en caso de fallo de API
    return isNsfw 
        ? "https://media.giphy.com/media/13HXKG2HGN8aPK/giphy.mp4" 
        : "https://media.giphy.com/media/10i5d1xXpS9tG/giphy.mp4";
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
            
            // Envío automático de actualización al canal oficial
            try {
                const updateMessage = `🚀 *¡${BOT_NAME} se ha actualizado a la Versión ${BOT_VERSION}!* 💚\n\n✨ Novedades:\n• Nuevas acciones SFW y NSFW con GIFs mejorados.\n• Soporte para descarga universal de APKs.\n• Estabilidad y optimización general.\n\nSigue el canal oficial: ${CHANNEL_LINK}`;
                await sock.sendMessage(CHANNEL_JID, { text: updateMessage });
            } catch (e) {
                console.log("ℹ️ No se pudo enviar el aviso automático al canal (verifica el JID si es necesario).");
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        const from = m.key.remoteJid;
        const senderId = m.key.participant || from;
        const isGroup = from.endsWith('@g.us');

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
                                     `  • \`.BotEdit\` | \`.bot on/off\`\n` +
                                     `  • \`.SetBotImage\` | \`.girl\`\n\n` +
                                     `🤖 *SubBot*\n` +
                                     `  • \`.code [número]\`\n\n` +
                                     `📷 *Multimedia & APK*\n` +
                                     `  • \`.sticker / .s\`\n` +
                                     `  • \`.apk [enlace]\`\n\n` +
                                     `👤 *Perfil*\n` +
                                     `  • \`.join\` | \`.out\` | \`.perfil\` | \`.coins\`\n\n` +
                                     `✨ *Acciones SFW*\n` +
                                     `  • \`.kiss\` | \`.hug\` | \`.pat\` | \`.slap\` | \`.dance\` | \`.cry\` | \`.poke\`\n\n` +
                                     `📥 *Download*\n` +
                                     `  • \`.YT\` | \`.mp3\` | \`.tt\` | \`.FB\`\n\n` +
                                     `💰 *Capital*\n` +
                                     `  • \`.work\` | \`.bet\` | \`.crime\` | \`.daily\`\n\n` +
                                     `🔞 *NSFW & Acciones Adultas (Admin)*\n` +
                                     `  • \`.nsfw on / off\`\n` +
                                     `  • \`.downloadX [enlace]\`\n` +
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
                        await sock.sendMessage(from, { text: '❌ Responde a una imagen/video o envíala con el texto `.sticker`' }, { quoted: m });
                        break;
                    }

                    await sock.sendMessage(from, { text: '⏳ Creando sticker...' }, { quoted: m });
                    try {
                        let targetMsg = m;
                        if (isQuotedMedia) {
                            targetMsg = { message: quotedMsg };
                        }

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
                        await sock.sendMessage(from, { text: '❌ Ocurrió un error al procesar el sticker.' }, { quoted: m });
                    }
                    break;

                case 'apk':
                    if (!query.startsWith('http')) {
                        await sock.sendMessage(from, { text: '❌ Por favor ingresa un enlace de descarga de APK válido.' }, { quoted: m });
                        break;
                    }
                    await sock.sendMessage(from, { text: '📥 Descargando archivo APK...' }, { quoted: m });
                    const tempApk = `./temp_apk_${Date.now()}.apk`;
                    try {
                        exec(`curl -L -o "${tempApk}" "${query}"`, async (error) => {
                            if (error || !fs.existsSync(tempApk)) {
                                await sock.sendMessage(from, { text: '❌ No se pudo descargar el APK. Verifica el enlace.' }, { quoted: m });
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

                case 'kiss':
                case 'hug':
                case 'pat':
                case 'slap':
                case 'dance':
                case 'cry':
                case 'poke':
                case 'hit':
                    const targetUser = mentionedJid[0] ? `@${mentionedJid[0].split('@')[0]}` : 'alguien';
                    try {
                        const gifUrl = await fetchActionGifUrl(command, false);
                        await sock.sendMessage(from, { 
                            video: { url: gifUrl }, 
                            gifPlayback: true, 
                            caption: `✨ Luna te muestra la acción *${command.toUpperCase()}* hacia${targetUser}.`, 
                            contextInfo: { mentionedJid: mentionedJid[0] ? [mentionedJid[0]] : [] } 
                        }, { quoted: m });
                    } catch (e) {
                        await sock.sendMessage(from, { text: `✨ Acción *${command.toUpperCase()}* hacia${targetUser}.`, contextInfo: { mentionedJid } }, { quoted: m });
                    }
                    break;

                case 'trap':
                case 'blowjob':
                case 'cum':
                case 'nsfw_kiss':
                    if (!nsfwStatus[from]) {
                        await sock.sendMessage(from, { text: '🔒 *Acceso Denegado:* El modo NSFW está desactivado en este chat. Un administrador debe activarlo con `.nsfw on`.' }, { quoted: m });
                        break;
                    }
                    const nsfwAction = command === 'nsfw_kiss' ? 'kiss' : command;
                    const targetNsfwUser = mentionedJid[0] ? `@${mentionedJid[0].split('@')[0]}` : 'alguien';
                    try {
                        const nsfwGifUrl = await fetchActionGifUrl(nsfwAction, true);
                        await sock.sendMessage(from, { 
                            video: { url: nsfwGifUrl }, 
                            gifPlayback: true, 
                            caption: `🔞 Acción adulta *${command.toUpperCase()}* hacia${targetNsfwUser}.`, 
                            contextInfo: { mentionedJid: mentionedJid[0] ? [mentionedJid[0]] : [] } 
                        }, { quoted: m });
                    } catch (e) {
                        await sock.sendMessage(from, { text: `🔞 Acción adulta *${command.toUpperCase()}*.` }, { quoted: m });
                    }
                    break;

                case 'code':
                    if (!query) {
                        await sock.sendMessage(from, { text: '❌ Por favor ingresa un número. Ejemplo: `.code 573001234567`' }, { quoted: m });
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
                        await sock.sendMessage(from, { text: `🔴 El bot ha sido *apagado* aquí.` }, { quoted: m });
                    } else if (estadoArg === 'on') {
                        botStatus[from] = true;
                        await sock.sendMessage(from, { text: `🟢 ¡El bot está *encendido*!` }, { quoted: m });
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
                        await sock.sendMessage(from, { text: `⚠️ Ya tienes perfil. Usa \`.perfil\`` }, { quoted: m });
                    } else {
                        userProfiles[senderId] = { name: 'Usuario', age: 18, coins: 100 };
                        await sock.sendMessage(from, { text: `🎉 ¡Perfil creado! +100 🪙 de bono.` }, { quoted: m });
                    }
                    break;

                case 'out':
                    delete userProfiles[senderId];
                    await sock.sendMessage(from, { text: `🗑️ Perfil eliminado.` }, { quoted: m });
                    break;

                case 'perfil':
                    if (!userProfiles[senderId]) userProfiles[senderId] = { name: 'Usuario', age: 18, coins: 100 };
                    const p = userProfiles[senderId];
                    await sock.sendMessage(from, { text: `👤 *Perfil*\n• Nombre: ${p.name}\n• Monedas: ${p.coins} 🪙` }, { quoted: m });
                    break;

                case 'coins':
                    if (!userProfiles[senderId]) userProfiles[senderId] = { name: 'Usuario', age: 18, coins: 100 };
                    await sock.sendMessage(from, { text: `🪙 Tienes *${userProfiles[senderId].coins} monedas*.` }, { quoted: m });
                    break;

                case 'work':
                    if (!userProfiles[senderId]) userProfiles[senderId] = { name: 'Usuario', age: 18, coins: 100 };
                    const gWork = Math.floor(Math.random() * 80) + 20;
                    userProfiles[senderId].coins += gWork;
                    await sock.sendMessage(from, { text: `💼 Trabajaste y ganaste +${gWork} 🪙.` }, { quoted: m });
                    break;

                case 'bet':
                    if (!userProfiles[senderId]) userProfiles[senderId] = { name: 'Usuario', age: 18, coins: 100 };
                    if (userProfiles[senderId].coins < 10) {
                        await sock.sendMessage(from, { text: `❌ Necesitas 10 coins.` }, { quoted: m });
                        break;
                    }
                    userProfiles[senderId].coins -= 10;
                    if (Math.random() < 0.5) {
                        userProfiles[senderId].coins += 40;
                        await sock.sendMessage(from, { text: `🎲 ¡Ganaste! +40 🪙.` }, { quoted: m });
                    } else {
                        await sock.sendMessage(from, { text: `🎲 ¡Perdiste la apuesta!` }, { quoted: m });
                    }
                    break;

                case 'yt':
                    if (!query.startsWith('http')) {
                        await sock.sendMessage(from, { text: '❌ Ingresa enlace de YouTube.' }, { quoted: m });
                        break;
                    }
                    await sock.sendMessage(from, { text: '📥 Descargando video...' }, { quoted: m });
                    const tempYt = `./temp_yt_${Date.now()}.mp4`;
                    try {
                        await downloadMediaWithYtDlp(query, tempYt, 'mp4');
                        await sock.sendMessage(from, { video: fs.readFileSync(tempYt), mimetype: 'video/mp4' }, { quoted: m });
                        fs.unlinkSync(tempYt);
                    } catch (e) {
                        if (fs.existsSync(tempYt)) fs.unlinkSync(tempYt);
                        await sock.sendMessage(from, { text: '❌ Error al descargar.' }, { quoted: m });
                    }
                    break;

                case 'nsfw':
                    const subCommand = args[0]?.toLowerCase();
                    if (subCommand === 'on' || subCommand === 'off') {
                        nsfwStatus[from] = (subCommand === 'on');
                        await sock.sendMessage(from, { text: `🔞 NSFW *${subCommand === 'on' ? 'ACTIVADO' : 'DESACTIVADO'}*` }, { quoted: m });
                    }
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