// worker-1.js
const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
} = require('@discordjs/voice');
const express = require('express');

const WORKER_TOKEN = process.env.WORKER_1_TOKEN;
const PORT = process.env.PORT || 3000;
const WORKER_INDEX = 0;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const app = express();
app.use(express.json());

let currentConnection = null;

async function playSoundInChannel(guildId, channelId, soundUrl) {
  try {
    console.log(`🎵 Worker ${WORKER_INDEX}: Rejoindre canal ${channelId}`);
    
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.error('Serveur non trouvé');
      return;
    }
    
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      console.error('Canal non trouvé');
      return;
    }
    
    if (currentConnection) {
      currentConnection.destroy();
      currentConnection = null;
    }
    
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    });
    
    currentConnection = connection;
    
    await new Promise((resolve, reject) => {
      connection.on(VoiceConnectionStatus.Ready, resolve);
      connection.on(VoiceConnectionStatus.Disconnected, reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    console.log(`✅ Worker ${WORKER_INDEX}: Connecté !`);
    
    const player = createAudioPlayer();
    const resource = createAudioResource(soundUrl);
    
    connection.subscribe(player);
    player.play(resource);
    console.log(`🔊 Worker ${WORKER_INDEX}: Lecture en cours...`);
    
    await new Promise((resolve) => {
      player.on(AudioPlayerStatus.Idle, () => {
        console.log(`✅ Worker ${WORKER_INDEX}: Son terminé`);
        resolve();
      });
      setTimeout(resolve, 10000);
    });
    
    connection.destroy();
    currentConnection = null;
    console.log(`👋 Worker ${WORKER_INDEX}: Déconnecté`);
    
  } catch (error) {
    console.error(`❌ Worker ${WORKER_INDEX} erreur:`, error.message);
    if (currentConnection) {
      currentConnection.destroy();
      currentConnection = null;
    }
  }
}

app.post('/command', async (req, res) => {
  const { action, channelId, soundUrl, guildId } = req.body;
  console.log(`📨 Worker ${WORKER_INDEX}: Ordre reçu - ${action}`);
  
  if (action === 'join') {
    playSoundInChannel(guildId, channelId, soundUrl);
    res.json({ success: true, message: 'Ordre reçu' });
  } else {
    res.json({ success: false, message: 'Action inconnue' });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    worker: WORKER_INDEX,
    connected: client.user ? true : false,
  });
});

client.once('ready', () => {
  console.log(`🤖 Worker ${WORKER_INDEX} connecté: ${client.user.tag}`);
});

app.listen(PORT, () => {
  console.log(`🌐 Worker ${WORKER_INDEX} webhook su
