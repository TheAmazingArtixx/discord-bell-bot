// worker-bot.js
const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
} = require('@discordjs/voice');
const express = require('express');

const WORKER_TOKEN = process.env.WORKER_TOKEN;
const PORT = process.env.PORT || 3000;
const WORKER_INDEX = process.env.WORKER_INDEX || 0;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const app = express();
app.use(express.json());

let currentConnection = null;

// Jouer le son dans un canal vocal
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
    
    // Se déconnecter si déjà connecté
    if (currentConnection) {
      currentConnection.destroy();
      currentConnection = null;
    }
    
    // Rejoindre le canal
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    });
    
    currentConnection = connection;
    
    // Attendre que la connexion soit prête
    await new Promise((resolve, reject) => {
      connection.on(VoiceConnectionStatus.Ready, resolve);
      connection.on(VoiceConnectionStatus.Disconnected, reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    console.log(`✅ Worker ${WORKER_INDEX}: Connecté !`);
    
    // Créer le lecteur audio
    const player = createAudioPlayer();
    const resource = createAudioResource(soundUrl);
    
    connection.subscribe(player);
    
    // Jouer le son
    player.play(resource);
    console.log(`🔊 Worker ${WORKER_INDEX}: Lecture en cours...`);
    
    // Attendre la fin du son
    await new Promise((resolve) => {
      player.on(AudioPlayerStatus.Idle, () => {
        console.log(`✅ Worker ${WORKER_INDEX}: Son terminé`);
        resolve();
      });
      
      // Timeout de sécurité (10 secondes max)
      setTimeout(resolve, 10000);
    });
    
    // Se déconnecter
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

// Webhook pour recevoir les ordres du master
app.post('/command', async (req, res) => {
  const { action, channelId, soundUrl, guildId } = req.body;
  
  console.log(`📨 Worker ${WORKER_INDEX}: Ordre reçu - ${action}`);
  
  if (action === 'join') {
    // Exécuter en arrière-plan
    playSoundInChannel(guildId, channelId, soundUrl);
    res.json({ success: true, message: 'Ordre reçu' });
  } else {
    res.json({ success: false, message: 'Action inconnue' });
  }
});

// Health check
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

// Démarrer le serveur et le bot
app.listen(PORT, () => {
  console.log(`🌐 Worker ${WORKER_INDEX} webhook sur port ${PORT}`);
});

client.login(WORKER_TOKEN);
