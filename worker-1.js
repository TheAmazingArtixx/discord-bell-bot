// worker-1.js
import { Client, GatewayIntentBits } from "discord.js";
import { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus,
    entersState,
    StreamType
} from "@discordjs/voice";

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
        console.log(`🔗 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: URL du son: ${SOUND_URL}`);
        
        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });
        
        // Attendre que la connexion soit prête
        console.log(`⏳ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Attente de connexion...`);
        await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
        console.log(`✅ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Connecté à ${channel.name}`);
        
        // Créer le player et la ressource
        const player = createAudioPlayer();
        const resource = createAudioResource(SOUND_URL, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true
        });
        
        if (resource.volume) {
            resource.volume.setVolume(1.0); // Volume à 100%
        }
        
        console.log(`🔊 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Ressource audio créée`);
        
        // Souscrire le player à la connexion
        connection.subscribe(player);
        console.log(`🔗 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Player souscrit à la connexion`);
        
        // Jouer le son
        player.play(resource);
        console.log(`▶️ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Lecture démarrée !`);
        
        // Attendre la fin de la lecture
        await new Promise((resolve, reject) => {
            player.on(AudioPlayerStatus.Playing, () => {
                console.log(`🎶 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Audio en cours de lecture...`);
            });
            
            player.on(AudioPlayerStatus.Idle, () => {
                console.log(`⏹️ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Lecture terminée`);
                resolve();
            });
            
            player.on('error', (error) => {
                console.error(`❌ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Erreur player:`, error);
                reject(error);
            });
            
            // Timeout de sécurité
            setTimeout(() => {
                console.log(`⏱️ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Timeout atteint`);
                resolve();
            }, 30000);
        });
        
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        console.log(`✅ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Sonnerie jouée dans ${channel.name} (${totalTime}s)`);
        
        console.log(`👋 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Déconnexion...`);
        connection.destroy();
        
    } catch (error) {
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        console.error(`❌ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Erreur après ${totalTime}s:`, error.message);
        if (connection) {
            connection.destroy();
        }
    }
}

async function scheduleBell() {
    const delay = getTimeUntilNextBell() - 5000;
    const delaySeconds = Math.floor(delay / 1000);
    const nextBellTime = new Date(Date.now() + delay + 5000);
    
    console.log(`⏰ [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: Prochaine sonnerie à ${nextBellTime.toLocaleTimeString()} (dans ${delaySeconds}s)`);
    
    setTimeout(async () => {
        console.log(`🔔 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX}: DÉCLENCHEMENT !`);
        
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
        scheduleBell();
    }, delay);
}

client.once("ready", () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🤖 [${new Date().toLocaleTimeString()}] Worker ${WORKER_INDEX} DÉMARRÉ`);
    console.log(`   Bot: ${client.user.tag}`);
    console.log(`   Sound URL: ${SOUND_URL}`);
    console.log(`${'='.repeat(60)}\n`);
    scheduleBell();
});

client.login(WORKER_TOKEN);
