// worker-1.js
import { Client, GatewayIntentBits } from "discord.js";
import { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus,
    entersState
} from "@discordjs/voice";
import { createReadStream } from "fs";
import { pipeline } from "stream";
import { promisify } from "util";
import https from "https";
import http from "http";

const streamPipeline = promisify(pipeline);

const WORKER_TOKEN = process.env.WORKER_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const SOUND_URL = process.env.SOUND_URL;
const WORKER_INDEX = 1;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

function getTimeUntilNextBell() {
    const now = new Date();
    const minutes = now.getMinutes();
    
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

// Fonction pour télécharger l'audio en stream
function getAudioStream(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        
        protocol.get(url, (response) => {
            if (response.statusCode === 200) {
                console.log(`✅ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Stream audio récupéré (${response.headers['content-type']})`);
                resolve(response);
            } else {
                reject(new Error(`HTTP ${response.statusCode}`));
            }
        }).on('error', reject);
    });
}

async function playBell(channel) {
    let connection = null;
    let player = null;
    const startTime = Date.now();
    
    try {
        console.log(`\n🎵 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: === DÉBUT SONNERIE ===`);
        console.log(`🔗 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Canal: ${channel.name}`);
        console.log(`🔗 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: URL: ${SOUND_URL}`);
        
        // Connexion vocale
        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });
        
        console.log(`⏳ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Connexion en cours...`);
        
        // Attendre que la connexion soit établie
        await entersState(connection, VoiceConnectionStatus.Ready, 15000);
        console.log(`✅ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Connexion établie !`);
        
        // Petit délai pour stabiliser la connexion
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Créer le player
        player = createAudioPlayer();
        
        // Gestion des événements du player
        player.on(AudioPlayerStatus.Playing, () => {
            console.log(`▶️ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: SON EN LECTURE !`);
        });
        
        player.on(AudioPlayerStatus.Idle, () => {
            console.log(`⏹️ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Lecture terminée`);
        });
        
        player.on('error', error => {
            console.error(`❌ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Erreur player:`, error.message);
        });
        
        // Souscrire le player AVANT de charger l'audio
        const subscription = connection.subscribe(player);
        console.log(`🔗 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Player connecté`);
        
        // Récupérer le stream audio
        console.log(`📥 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Téléchargement audio...`);
        const stream = await getAudioStream(SOUND_URL);
        
        // Créer la ressource audio depuis le stream
        const resource = createAudioResource(stream, {
            inlineVolume: true
        });
        
        if (resource.volume) {
            resource.volume.setVolume(1.0);
        }
        
        console.log(`🎧 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Ressource créée, démarrage...`);
        
        // Jouer !
        player.play(resource);
        
        // Attendre la fin (max 60 secondes)
        await new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (player.state.status === AudioPlayerStatus.Idle) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 500);
            
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
            }, 60000);
        });
        
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        console.log(`✅ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: === FIN SONNERIE (${totalTime}s) ===\n`);
        
        // Nettoyage
        if (subscription) subscription.unsubscribe();
        if (player) player.stop();
        if (connection) {
            await new Promise(resolve => setTimeout(resolve, 500));
            connection.destroy();
        }
        
    } catch (error) {
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        console.error(`❌ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: ERREUR après ${totalTime}s:`);
        console.error(error);
        
        if (player) player.stop();
        if (connection) connection.destroy();
    }
}

async function scheduleBell() {
    const delay = getTimeUntilNextBell() - 5000;
    const delaySeconds = Math.floor(delay / 1000);
    const nextBellTime = new Date(Date.now() + delay + 5000);
    
    console.log(`⏰ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Prochaine sonnerie à ${nextBellTime.toLocaleTimeString()} (dans ${delaySeconds}s)`);
    
    setTimeout(async () => {
        console.log(`🔔 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: ⚡ DÉCLENCHEMENT !`);
        
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
            console.error(`❌ Worker ${WORKER_INDEX}: Serveur non trouvé`);
            scheduleBell();
            return;
        }
        
        const channel = findAvailableChannel(guild);
        if (!channel) {
            console.log(`⚠️ Worker ${WORKER_INDEX}: Aucun salon vocal actif`);
            scheduleBell();
            return;
        }
        
        await playBell(channel);
        scheduleBell();
    }, delay);
}

client.once("ready", () => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🤖 Worker ${WORKER_INDEX} DÉMARRÉ - ${client.user.tag}`);
    console.log(`🔊 Sound URL: ${SOUND_URL}`);
    console.log(`${'='.repeat(70)}\n`);
    scheduleBell();
});

client.login(WORKER_TOKEN);