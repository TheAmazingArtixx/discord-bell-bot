import { Client, GatewayIntentBits } from "discord.js";
import { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus,
    VoiceConnectionStatus
} from "@discordjs/voice";

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

const WORKER_TOKEN = process.env.WORKER_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const SOUND_URL = process.env.SOUND_URL;
const WORKER_INDEX = 1;

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
    const activeChannels = guild.channels.cache
        .filter(ch => ch.type === 2 && ch.members.size > 0)
        .map(ch => ch);
    
    if (activeChannels.length === 0) return null;
    return activeChannels[(WORKER_INDEX - 1) % activeChannels.length];
}

async function playBell(channel) {
    let connection = null;
    
    try {
        console.log(`[${new Date().toISOString()}] Rejoindre: ${channel.name}`);
        
        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator
        });

        // Attendre connexion
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
            
            connection.on(VoiceConnectionStatus.Ready, () => {
                clearTimeout(timeout);
                resolve();
            });
            
            connection.on(VoiceConnectionStatus.Disconnected, () => {
                clearTimeout(timeout);
                reject(new Error('Disconnected'));
            });
        });

        console.log(`[${new Date().toISOString()}] Connecté - Lecture...`);

        const player = createAudioPlayer();
        const resource = createAudioResource(SOUND_URL);
        
        connection.subscribe(player);
        player.play(resource);

        // Attendre fin lecture
        await new Promise((resolve) => {
            player.on(AudioPlayerStatus.Idle, resolve);
            setTimeout(resolve, 30000); // Max 30s
        });

        console.log(`[${new Date().toISOString()}] Terminé`);
        
        player.stop();
        connection.destroy();
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ERREUR:`, error.message);
        if (connection) connection.destroy();
    }
}

async function scheduleBell() {
    const delay = getTimeUntilNextBell() - 5000;
    const next = new Date(Date.now() + delay + 5000);
    
    console.log(`Prochaine sonnerie: ${next.toLocaleTimeString()}`);
    
    setTimeout(async () => {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
            console.error('Serveur non trouvé');
            scheduleBell();
            return;
        }
        
        const channel = findAvailableChannel(guild);
        if (!channel) {
            console.log('Aucun salon actif');
            scheduleBell();
            return;
        }
        
        await playBell(channel);
        scheduleBell();
    }, delay);
}

client.once("ready", () => {
    console.log(`Bot démarré: ${client.user.tag}`);
    console.log(`URL: ${SOUND_URL}`);
    scheduleBell();
});

client.login(WORKER_TOKEN);