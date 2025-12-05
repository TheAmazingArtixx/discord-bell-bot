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

function getTimeUntilNextBell() {
    const INTERVAL_MINUTES = 5; // Change ce nombre
    
    const now = new Date();
    const minutes = now.getMinutes();
    
    let targetMinutes = Math.ceil((minutes + 1) / INTERVAL_MINUTES) * INTERVAL_MINUTES;
    if (targetMinutes >= 60) targetMinutes = targetMinutes - 60;
    
    const targetTime = new Date(now);
    targetTime.setMinutes(targetMinutes, 0, 0);
    
    if (targetMinutes <= minutes) {
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
    try {
        console.log(`🎵 Worker ${WORKER_INDEX}: Rejoindre ${channel.name}`);
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator
        });
        
        await new Promise((resolve, reject) => {
            connection.on(VoiceConnectionStatus.Ready, resolve);
            connection.on(VoiceConnectionStatus.Disconnected, reject);
            setTimeout(() => reject(new Error('Timeout')), 10000);
        });
        
        console.log(`✅ Worker ${WORKER_INDEX}: Connecté`);
        const player = createAudioPlayer();
        const resource = createAudioResource(SOUND_URL);
        connection.subscribe(player);
        player.play(resource);
        console.log(`🔊 Worker ${WORKER_INDEX}: Lecture...`);
        
        await new Promise((resolve) => {
            player.on(AudioPlayerStatus.Idle, resolve);
            setTimeout(resolve, 15000);
        });
        
        console.log(`✅ Worker ${WORKER_INDEX}: Terminé`);
        connection.destroy();
    } catch (error) {
        console.error(`❌ Worker ${WORKER_INDEX}:`, error.message);
    }
}

async function scheduleBell() {
    const delay = getTimeUntilNextBell() - 5000;
    console.log(`⏳ Worker ${WORKER_INDEX}: Prochaine sonnerie dans ${Math.floor(delay / 1000)}s`);
    setTimeout(async () => {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return;
        const channel = findAvailableChannel(guild);
        if (channel) await playBell(channel);
        scheduleBell();
    }, delay);
}

client.once("clientReady", () => {
    console.log(`🤖 Worker ${WORKER_INDEX} connecté: ${client.user.tag}`);
    scheduleBell();
});

client.login(WORKER_TOKEN);
