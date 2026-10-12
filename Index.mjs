import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import { exec } from 'child_process';

const BOT_NAME = "Luna Bot";
const BOT_OWNER = "Benjamin";

const nsfwStatus = {}; 
const botStatus = {}; 
const userProfiles = {}; 

function downloadMediaWithYtDlp(url, outputPath, format = 'mp4') {
    return new Promise((resolve, reject) => {
        let flag = format === 'mp3' ? '-x --audio-format mp3' : '-f "b/bv+ba"';
        const command = `yt-dlp --no-check-certificate --geo-bypass ${flag} -o "${outputPath}" "${url}"`;
        
        exec(command, { maxBuffer: 1024 * 1024 * 150 }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                if (fs.existsSync(outputPath)) {
                    resolve(outputPath);
                } else {
                    reject(new Error("El archivo no se generó."));
                }
            }
        });
    });
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log(`\n¡${BOT_NAME} con todas las opciones está en línea! ✅\n`);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        const from = m.key.remoteJid;
        const senderId = m.key.participant || from;
        const isGroup = from.endsWith('@g.us');

        if (botStatus[from] === false) {
            const msgBodyCheck = m.message.conversation || m.message.extendedTextMessage?.text || '';
            if (msgBodyCheck.toLowerCase() === '.bot on') {
                botStatus[from] = true;
                await sock.sendMessage(from, { text: `🟢 ¡${BOT_NAME} ha sido encendida y está operativa nuevamente!` }, { quoted: m });
            }
            return;
        }

        const messageType = Object.keys(m.message)[0];
        const body = messageType === 'conversation' 
            ? m.message.conversation 
            : messageType === 'extendedTextMessage' 
            ? m.message.extendedTextMessage.text 
            : '';

        if (body.startsWith('.') || body.startsWith('!')) {
            const args = body.slice(1).trim().split(/ +/);
            const command = args.shift().toLowerCase();
            const query = args.join(' ');
            const mentionedJid = m.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

            switch (command) {
                case 'help':
                case 'menu':
                    const menuText = `🐱 *Menú Principal de ${BOT_NAME}*\n\n` +
                                     `⚙️ *General*\n` +
                                     `  • \`.BotEdit\`\n` +
                                     `  • \`.bot on / .bot off\`\n` +
                                     `  • \`.SetBotImage\`\n` +
                                     `  • \`.welcome\` | \`.bye\`\n\n` +
                                     `👤 *Perfil*\n` +
                                     `  • \`.join\` | \`.out\` | \`.perfil\` | \`.coins\`\n\n` +
                                     `⛩️ *Anime*\n` +
                                     `  • \`.girl\` | \`.boy\`\n\n` +
                                     `✨ *Acciones*\n` +
                                     `  • \`.hit\` | \`.pat\` | \`.kiss\` | \`.hug\` | \`.slap\` | \`.poke\` | \`.tickle\` | \`.cuddle\` | \`.feed\` | \`.highfive\` | \`.bite\` | \`.kill\` | \`.wink\` | \`.dance\` | \`.cry\` | \`.blush\` | \`.wave\`\n\n` +
                                     `📥 *Download*\n` +
                                     `  • \`.YT [link]\` | \`.mp3 [link]\`\n` +
                                     `  • \`.tt [link]\` | \`.FB [link]\`\n\n` +
                                     `💰 *Capital*\n` +
                                     `  • \`.work\` | \`.bet\` | \`.crime\` | \`.daily\`\n\n` +
                                     `🔞 *NSFW (Solo Admins)*\n` +
                                     `  • \`.nsfw on / off\`\n` +
                                     `  • \`.downloadX [enlace]\``;

                    await sock.sendMessage(from, { text: menuText }, { quoted: m });
                    break;

                case 'botedit':
                    await sock.sendMessage(from, { text: `⚙️ Configuración de ${BOT_NAME} operando bajo el propietario *${BOT_OWNER}*.` }, { quoted: m });
                    break;

                case 'bot':
                    const estadoArg = args[0]?.toLowerCase();
                    if (estadoArg === 'off') {
                        botStatus[from] = false;
                        await sock.sendMessage(from, { text: `🔴 El bot ha sido *apagado* en este chat. Usa \`.bot on\` para reactivarlo.` }, { quoted: m });
                    } else if (estadoArg === 'on') {
                        botStatus[from] = true;
                        await sock.sendMessage(from, { text: `🟢 ¡El bot ya está *encendido*!` }, { quoted: m });
                    } else {
                        await sock.sendMessage(from, { text: `ℹ️ Uso correcto: \`.bot on\` o \`.bot off\`` }, { quoted: m });
                    }
                    break;

                case 'setbotimage':
                    await sock.sendMessage(from, { text: `🖼️ Envía una foto con la leyenda \`.SetBotImage\` para actualizar la imagen.` }, { quoted: m });
                    break;

                case 'welcome':
                    await sock.sendMessage(from, { text: `👋 *Bienvenida:* ¡Hola a todos! Bienvenidos al grupo oficial gestionado por ${BOT_NAME}. 🎉` }, { quoted: m });
                    break;

                case 'bye':
                    await sock.sendMessage(from, { text: `😢 *Despedida:* ¡Hasta luego! Esperamos verte pronto. 👋` }, { quoted: m });
                    break;

                case 'join':
                    if (userProfiles[senderId]) {
                        await sock.sendMessage(from, { text: `⚠️ Ya tienes un perfil creado. Usa \`.perfil\` para verlo.` }, { quoted: m });
                    } else {
                        userProfiles[senderId] = { name: 'Usuario', age: 18, coins: 100 };
                        await sock.sendMessage(from, { text: `🎉 ¡Perfil creado! Se te otorgaron 100 🪙 de bono. Usa \`.perfil [Nombre] [Edad]\` para configurarlo.` }, { quoted: m });
                    }
                    break;

                case 'out':
                    if (!userProfiles[senderId]) {
                        await sock.sendMessage(from, { text: `❌ No tienes ningún perfil activo.` }, { quoted: m });
                    } else {
                        delete userProfiles[senderId];
                        await sock.sendMessage(from, { text: `🗑️ Tu perfil ha sido eliminado.` }, { quoted: m });
                    }
                    break;

                case 'perfil':
                    if (!userProfiles[senderId]) {
                        await sock.sendMessage(from, { text: `❌ No tienes perfil. Regístrate con \`.join\`` }, { quoted: m });
                        break;
                    }
                    if (args.length >= 2) {
                        const nuevoNombre = args[0];
                        const nuevaEdad = parseInt(args[1]) || userProfiles[senderId].age;
                        userProfiles[senderId].name = nuevoNombre;
                        userProfiles[senderId].age = nuevaEdad;
                        await sock.sendMessage(from, { text: `✅ ¡Perfil actualizado!\n👤 Nombre: *${nuevoNombre}*\n🎂 Edad: *${nuevaEdad}*` }, { quoted: m });
                    } else {
                        const p = userProfiles[senderId];
                        await sock.sendMessage(from, { text: `👤 *Tu Perfil*\n• Nombre: *${p.name}*\n• Edad: *${p.age}*\n• Monedas: *${p.coins} 🪙*\n\n_Edita con:_ \`.perfil [Nombre] [Edad]\`` }, { quoted: m });
                    }
                    break;

                case 'coins':
                    if (!userProfiles[senderId]) userProfiles[senderId] = { name: 'Usuario', age: 18, coins: 100 };
                    await sock.sendMessage(from, { text: `🪙 Tienes *${userProfiles[senderId].coins} monedas* en tu cuenta.` }, { quoted: m });
                    break;

                case 'girl':
                    await sock.sendMessage(from, { text: `🌸 *Chica Anime*\n• Nombre: Akame\n• Edad: 19\n• Desc: Asesina experta con espada imperial.\n🖼️ https://i.imgur.com/83Z9375.jpeg` }, { quoted: m });
                    break;

                case 'boy':
                    await sock.sendMessage(from, { text: `⚡ *Chico Anime*\n• Nombre: Levi Ackerman\n• Edad: 24\n• Desc: El soldado más fuerte.\n🖼️ https://i.imgur.com/13Z9375.jpeg` }, { quoted: m });
                    break;

                case 'hit':
                case 'pat':
                case 'kiss':
                case 'hug':
                case 'slap':
                case 'poke':
                case 'tickle':
                case 'cuddle':
                case 'feed':
                case 'highfive':
                case 'bite':
                case 'kill':
                case 'wink':
                case 'dance':
                case 'cry':
                case 'blush':
                case 'wave':
                    const targetUser = mentionedJid[0] ? `@${mentionedJid[0].split('@')[0]}` : 'alguien';
                    await sock.sendMessage(from, { text: `✨ Acción *${command.toUpperCase()}* hacia ${targetUser}.`, contextInfo: { mentionedJid } }, { quoted: m });
                    break;

                case 'work':
                    if (!userProfiles[senderId]) userProfiles[senderId] = { name: 'Usuario', age: 18, coins: 100 };
                    const gananciaWork = Math.floor(Math.random() * 100) + 20; 
                    userProfiles[senderId].coins += gananciaWork;
                    await sock.sendMessage(from, { text: `💼 Trabajaste duro y ganaste *${gananciaWork} coins* 🪙.\n💰 Balance: *${userProfiles[senderId].coins} coins*.` }, { quoted: m });
                    break;

                case 'bet':
                    if (!userProfiles[senderId]) userProfiles[senderId] = { name: 'Usuario', age: 18, coins: 100 };
                    if (userProfiles[senderId].coins < 10) {
                        await sock.sendMessage(from, { text: `❌ Necesitas al menos 10 coins para apostar.` }, { quoted: m });
                        break;
                    }
                    userProfiles[senderId].coins -= 10; 
                    if (Math.random() < 0.45) {
                        userProfiles[senderId].coins += 50;
                        await sock.sendMessage(from, { text: `🎲 ¡Ganaste la apuesta! +50 🪙. Balance: *${userProfiles[senderId].coins} coins*.` }, { quoted: m });
                    } else {
                        userProfiles[senderId].coins = Math.max(0, userProfiles[senderId].coins - 15);
                        await sock.sendMessage(from, { text: `🎲 ¡Perdiste en el juego! -15 🪙. Balance: *${userProfiles[senderId].coins} coins*.` }, { quoted: m });
                    }
                    break;

                case 'crime':
                    if (!userProfiles[senderId]) userProfiles[senderId] = { name: 'Usuario', age: 18, coins: 100 };
                    if (Math.random() > 0.5) {
                        const reward = Math.floor(Math.random() * 80) + 30;
                        userProfiles[senderId].coins += reward;
                        await sock.sendMessage(from, { text: `🦹‍♂️ ¡Golpe exitoso! Obtuviste +${reward} 🪙.` }, { quoted: m });
                    } else {
                        userProfiles[senderId].coins = Math.max(0, userProfiles[senderId].coins - 30);
                        await sock.sendMessage(from, { text: `🚨 ¡Te atrapó la policía! Multa de -30 🪙.` }, { quoted: m });
                    }
                    break;

                case 'daily':
                    if (!userProfiles[senderId]) userProfiles[senderId] = { name: 'Usuario', age: 18, coins: 100 };
                    userProfiles[senderId].coins += 200;
                    await sock.sendMessage(from, { text: `🎁 ¡Reclamo diario! +200 🪙. Balance: *${userProfiles[senderId].coins} coins*.` }, { quoted: m });
                    break;

                case 'yt':
                    if (!query.startsWith('http')) {
                        await sock.sendMessage(from, { text: '❌ Ingresa un enlace de YouTube válido.' }, { quoted: m });
                        break;
                    }
                    await sock.sendMessage(from, { text: '📥 Descargando video de YouTube...' }, { quoted: m });
                    const tempYt = `./temp_yt_${Date.now()}.mp4`;
                    try {
                        await downloadMediaWithYtDlp(query, tempYt, 'mp4');
                        await sock.sendMessage(from, { video: fs.readFileSync(tempYt), mimetype: 'video/mp4', caption: '✅ Video enviado.' }, { quoted: m });
                        fs.unlinkSync(tempYt);
                    } catch (e) {
                        if (fs.existsSync(tempYt)) fs.unlinkSync(tempYt);
                        await sock.sendMessage(from, { text: '❌ Error al descargar de YouTube.' }, { quoted: m });
                    }
                    break;

                case 'mp3':
                    if (!query.startsWith('http')) {
                        await sock.sendMessage(from, { text: '❌ Ingresa un enlace para extraer audio.' }, { quoted: m });
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
                    if (!query.startsWith('http')) {
                        await sock.sendMessage(from, { text: '❌ Ingresa un enlace de TikTok válido.' }, { quoted: m });
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
                        await sock.sendMessage(from, { text: '❌ Error al descargar TikTok.' }, { quoted: m });
                    }
                    break;

                case 'fb':
                    if (!query.startsWith('http')) {
                        await sock.sendMessage(from, { text: '❌ Ingresa un enlace de Facebook válido.' }, { quoted: m });
                        break;
                    }
                    await sock.sendMessage(from, { text: '📥 Descargando Facebook...' }, { quoted: m });
                    const tempFb = `./temp_fb_${Date.now()}.mp4`;
                    try {
                        await downloadMediaWithYtDlp(query, tempFb, 'mp4');
                        await sock.sendMessage(from, { video: fs.readFileSync(tempFb), mimetype: 'video/mp4', caption: '✅ Facebook enviado.' }, { quoted: m });
                        fs.unlinkSync(tempFb);
                    } catch (e) {
                        if (fs.existsSync(tempFb)) fs.unlinkSync(tempFb);
                        await sock.sendMessage(from, { text: '❌ Error al descargar Facebook.' }, { quoted: m });
                    }
                    break;

                case 'nsfw':
                    const subCommand = args[0]?.toLowerCase();
                    if (subCommand === 'on' || subCommand === 'off') {
                        if (isGroup) {
                            const groupMetadata = await sock.groupMetadata(from);
                            const senderIdParticipant = m.key.participant || m.key.remoteJid;
                            const participant = groupMetadata.participants.find(p => p.id === senderIdParticipant);
                            const isAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');

                            if (!isAdmin) {
                                await sock.sendMessage(from, { text: '❌ Solo los administradores pueden configurar el modo NSFW.' }, { quoted: m });
                                break;
                            }
                        }
                        nsfwStatus[from] = (subCommand === 'on');
                        await sock.sendMessage(from, { text: `🔞 Modo NSFW *${subCommand === 'on' ? 'ACTIVADO' : 'DESACTIVADO'}* para este chat.` }, { quoted: m });
                    } else {
                        const estadoActual = nsfwStatus[from] ? 'ACTIVADO ✅' : 'DESACTIVADO 🔒';
                        await sock.sendMessage(from, { text: `ℹ️ El modo NSFW está *${estadoActual}*.` }, { quoted: m });
                    }
                    break;

                case 'downloadx':
                    if (!nsfwStatus[from]) {
                        await sock.sendMessage(from, { text: '🔒 *Acceso Denegado:* El modo NSFW está desactivado. Un administrador debe activarlo con `.nsfw on`.' }, { quoted: m });
                        break;
                    }

                    if (!query.startsWith('http')) {
                        await sock.sendMessage(from, { text: '❌ Ingresa un enlace válido. Ejemplo: `.downloadX https://...`' }, { quoted: m });
                        break;
                    }

                    await sock.sendMessage(from, { text: '📥 Descargando contenido con downloadX...' }, { quoted: m });
                    const tempDx = `./temp_dx_${Date.now()}.mp4`;
                    try {
                        await downloadMediaWithYtDlp(query, tempDx, 'mp4');
                        await sock.sendMessage(from, { video: fs.readFileSync(tempDx), mimetype: 'video/mp4', caption: '🔞 Video descargado con downloadX.' }, { quoted: m });
                        fs.unlinkSync(tempDx);
                    } catch (e) {
                        if (fs.existsSync(tempDx)) fs.unlinkSync(tempDx);
                        await sock.sendMessage(from, { text: '❌ Error al procesar el enlace en downloadX.' }, { quoted: m });
                    }
                    break;

                case 'ping':
                    await sock.sendMessage(from, { text: '¡Pong! 🏓 Luna Bot está 100% activa.' }, { quoted: m });
                    break;

                case 'owner':
                    await sock.sendMessage(from, { text: `👑 Creador del bot: *${BOT_OWNER}*\n🤖 Nombre: *${BOT_NAME}*` }, { quoted: m });
                    break;

                default:
                    break;
            }
        }
    });
}

connectToWhatsApp();
