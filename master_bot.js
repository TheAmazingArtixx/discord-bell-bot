// master-bot.js
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

const MASTER_TOKEN = process.env.MASTER_TOKEN;
const WORKER_WEBHOOK_URLS = process.env.WORKER_WEBHOOKS.split(',');
const GUILD_ID = process.env.GUILD_ID;
const SOUND_URL = process.env.SOUND_URL; // URL vers votre fichier audio sur GitHub

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

let lastScanTime = Date.now();
const SCAN_INTERVAL = 10000; // 10 secondes
const assignedChannels = new Map(); // workerIndex -> channelId

// Fonction pour obtenir tous les canaux vocaux avec des membres
async function getActiveVoiceChannels(guild) {
  const channels = [];
  const voiceChannels = guild.channels.cache.filter(
    (c) => c.type === 2 && c.members.size > 0
  );
  
  voiceChannels.forEach((channel) => {
    channels.push({
      id: channel.id,
      name: channel.name,
      memberCount: channel.members.size,
    });
  });
  
  return channels;
}

// Distribuer les canaux aux workers (évite les doublons)
function distributeChannels(channels, workerCount) {
  const distribution = [];
  const usedChannels = new Set();
  
  channels.forEach((channel, index) => {
    if (index < workerCount && !usedChannels.has(channel.id)) {
      distribution.push({
        workerIndex: index,
        channelId: channel.id,
        channelName: channel.name,
      });
      usedChannels.add(channel.id);
    }
  });
  
  return distribution;
}

// Envoyer l'ordre à un worker via webhook
async function commandWorker(workerIndex, channelId, action = 'join') {
  try {
    const webhookUrl = WORKER_WEBHOOK_URLS[workerIndex];
    if (!webhookUrl) return;
    
    await axios.post(webhookUrl, {
      action,
      channelId,
      soundUrl: SOUND_URL,
      guildId: GUILD_ID,
    });
    
    console.log(`✅ Worker ${workerIndex} commandé: ${action} canal ${channelId}`);
  } catch (error) {
    console.error(`❌ Erreur worker ${workerIndex}:`, error.message);
  }
}

// Vérifier si on doit jouer la sonnerie (XX:00 ou XX:30)
function shouldPlayBell() {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  
  // Retourne true 5 secondes avant XX:00 ou XX:30
  return (
    (minutes === 29 && seconds === 55) ||
    (minutes === 59 && seconds === 55)
  );
}

// Calculer le temps jusqu'à la prochaine sonnerie
function timeUntilNextBell() {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  
  let targetMinute;
  if (minutes < 29 || (minutes === 29 && seconds < 55)) {
    targetMinute = 29;
  } else if (minutes < 59 || (minutes === 59 && seconds < 55)) {
    targetMinute = 59;
  } else {
    targetMinute = 29;
  }
  
  const target = new Date(now);
  target.setMinutes(targetMinute, 55, 0);
  
  if (target <= now) {
    target.setMinutes(target.getMinutes() + 30);
  }
  
  return target - now;
}

// Boucle principale de scan
async function mainLoop() {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
      console.log('⚠️ Serveur non trouvé');
      return;
    }
    
    // Scan des canaux actifs toutes les 10 secondes
    if (Date.now() - lastScanTime >= SCAN_INTERVAL) {
      const activeChannels = await getActiveVoiceChannels(guild);
      console.log(`📡 Scan: ${activeChannels.length} canaux actifs`);
      
      // Mettre à jour les assignments
      const distribution = distributeChannels(
        activeChannels,
        WORKER_WEBHOOK_URLS.length
      );
      
      assignedChannels.clear();
      distribution.forEach((d) => {
        assignedChannels.set(d.workerIndex, d.channelId);
      });
      
      lastScanTime = Date.now();
    }
    
    // Vérifier si on doit jouer la sonnerie
    if (shouldPlayBell()) {
      console.log('🔔 SONNERIE ! Envoi des workers...');
      
      // Envoyer tous les workers vers leurs canaux
      const promises = [];
      assignedChannels.forEach((channelId, workerIndex) => {
        promises.push(commandWorker(workerIndex, channelId, 'join'));
      });
      
      await Promise.all(promises);
      
      // Attendre 10 secondes (sonnerie + marge) puis attendre la prochaine sonnerie
      await new Promise((resolve) => setTimeout(resolve, 10000));
      
      // Attendre jusqu'à 5 secondes avant la prochaine sonnerie
      const waitTime = timeUntilNextBell();
      console.log(`⏳ Prochaine sonnerie dans ${Math.floor(waitTime / 1000)}s`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  } catch (error) {
    console.error('❌ Erreur mainLoop:', error);
  }
  
  // Continuer la boucle
  setTimeout(mainLoop, 1000);
}

client.once('ready', () => {
  console.log(`🤖 Master Bot connecté: ${client.user.tag}`);
  console.log(`👥 ${WORKER_WEBHOOK_URLS.length} workers configurés`);
  
  // Démarrer la boucle principale
  mainLoop();
});

client.login(MASTER_TOKEN);
