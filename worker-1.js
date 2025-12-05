// worker-1.js
import { Client, GatewayIntentBits } from "discord.js";
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } from "@discordjs/voice";

const WORKER_TOKEN = process.env.WORKER_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const SOUND_URL = process.env.SOUND_URL;
const WORKER_INDEX = 1;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

let logInterval = null;

function getTimeUntilNextBell() {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    
    // Trouver le prochain multiple de 5 minutes
    let targetMinutes = Math.ceil((minutes + 1) / 5) * 5;
    if (targetMinutes >= 60) targetMinutes = 0;
    
    const targetTime = new Date(now);
    targetTime.setMinutes(targetMinutes, 0, 0);
    
    if (targetMinutes === 0 && minutes >= 55) {
        targetTime.setHours(targetTime.getHours() + 1);
    }
    
    return targetTime - now;
}

function findAvailableChannel(guild) {
    const activeChannels = guild.channels.cache.filter(ch => ch.type === 2 && ch.members.size > 0).map(ch => ch);
    if (activeChannels.length === 0) return null;
    const index = (WORKER_INDEX - 1) % activeChannels.length;
    return activeChannels[index];
}

async function playBell(channel) {
    let connection = null;
    let startTime = Date.now();
    
    try {
        console.log(`🎵 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Rejoindre ${channel.name}`);
        
        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator
        });
        
        // Logs toutes les secondes pendant la connexion
        logInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            console.log(`⏳ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Connexion en cours... (${elapsed}s)`);
        }, 1000);
        
        await new Promise((resolve, reject) => {
            connection.on(VoiceConnectionStatus.Ready, resolve);
            connection.on(VoiceConnectionStatus.Disconnected, reject);
            setTimeout(() => reject(new Error('Timeout connexion')), 10000);
        });
        
        clearInterval(logInterval);
        console.log(`✅ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Connecté à ${channel.name}`);
        
        const player = createAudioPlayer();
        const resource = createAudioResource(SOUND_URL);
        connection.subscribe(player);
        player.play(resource);
        
        console.log(`🔊 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: 🎵 Sonnerie en cours dans ${channel.name}...`);
        
        // Logs toutes les secondes pendant la lecture
        let playStartTime = Date.now();
        logInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - playStartTime) / 1000);
            console.log(`🎶 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Lecture en cours... (${elapsed}s)`);
        }, 1000);
        
        await new Promise((resolve) => {
            player.on(AudioPlayerStatus.Idle, () => {
                clearInterval(logInterval);
                resolve();
            });
            setTimeout(() => {
                clearInterval(logInterval);
                resolve();
            }, 15000);
        });
        
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        console.log(`✅ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: 🎵 Sonnerie jouée dans ${channel.name} (durée: ${totalTime}s)`);
        
        console.log(`👋 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Déconnexion de ${channel.name}...`);
        connection.destroy();
        console.log(`✅ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: ✓ Déconnecté de ${channel.name}`);
        
    } catch (error) {
        clearInterval(logInterval);
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        console.error(`❌ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Erreur après ${totalTime}s - ${error.message}`);
        if (connection) {
            connection.destroy();
            console.log(`👋 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Déconnexion forcée suite à l'erreur`);
        }
    }
}

async function scheduleBell() {
    const delay = getTimeUntilNextBell() - 5000; // 5 secondes avant
    const delaySeconds = Math.floor(delay / 1000);
    const nextBellTime = new Date(Date.now() + delay + 5000);
    
    console.log(`⏰ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: ⏳ Prochaine sonnerie à ${nextBellTime.toLocaleTimeString()} (dans ${delaySeconds}s)`);
    
    setTimeout(async () => {
        console.log(`🔔 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: ⚡ DÉCLENCHEMENT DE LA SONNERIE !`);
        
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
            console.error(`❌ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Serveur non trouvé`);
            scheduleBell();
            return;
        }
        
        const channel = findAvailableChannel(guild);
        if (!channel) {
            console.log(`⚠️ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Aucun salon vocal actif`);
            scheduleBell();
            return;
        }
        
        await playBell(channel);
        console.log(`🔄 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Reprogrammation de la prochaine sonnerie...`);
        scheduleBell();
    }, delay);
}

client.once("clientReady", () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🤖 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX} DÉMARRÉ`);
    console.log(`   Bot: ${client.user.tag}`);
    console.log(`   Intervalle: Toutes les 5 minutes`);
    console.log(`${'='.repeat(60)}\n`);
    scheduleBell();
});

client.login(WORKER_TOKEN);
