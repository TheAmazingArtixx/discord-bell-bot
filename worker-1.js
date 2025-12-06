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
    return activeChannels[0];
}

async function playBell(channel) {
    let connection = null;
    let player = null;
    
    try {
        console.log(`[BELL] Connexion à ${channel.name}...`);
        
        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator
        });

        // Attendre que la connexion soit prête
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 15000);
            
            connection.once(VoiceConnectionStatus.Ready, () => {
                clearTimeout(timeout);
                console.log(`[BELL] Connecté !`);
                resolve();
            });
            
            connection.once(VoiceConnectionStatus.Disconnected, () => {
                clearTimeout(timeout);
                reject(new Error('Déconnecté'));
            });
        });

        // Attendre un peu pour stabiliser
        await new Promise(r => setTimeout(r, 1000));

        console.log(`[BELL] Lecture du son: ${SOUND_URL}`);
        
        player = createAudioPlayer();
        const resource = createAudioResource(SOUND_URL);
        
        connection.subscribe(player);
        
        // Attendre que le player soit prêt avant de jouer
        await new Promise(r => setTimeout(r, 500));
        
        player.play(resource);
        console.log(`[BELL] ▶️ SON EN LECTURE`);

        // Attendre la fin
        await new Promise((resolve) => {
            player.once(AudioPlayerStatus.Idle, () => {
                console.log(`[BELL] Lecture terminée`);
                resolve();
            });
            
            player.once('error', (err) => {
                console.error(`[BELL] Erreur player:`, err.message);
                resolve();
            });
            
            setTimeout(resolve, 45000); // Max 45s
        });

        // Nettoyage
        await new Promise(r => setTimeout(r, 1000));
        
        if (player) player.stop();
        if (connection) connection.destroy();
        
        console.log(`[BELL] Déconnecté\n`);
        
    } catch (error) {
        console.error(`[BELL] ERREUR:`, error.message);
        if (player) player.stop();
        if (connection) connection.destroy();
    }
}

async function scheduleBell() {
    const delay = getTimeUntilNextBell() - 5000;
    const next = new Date(Date.now() + delay + 5000);
    
    console.log(`⏰ Prochaine sonnerie: ${next.toLocaleTimeString()}`);
    
    setTimeout(async () => {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
            console.error('Serveur introuvable');
            scheduleBell();
            return;
        }
        
        const channel = findAvailableChannel(guild);
        if (!channel) {
            console.log('Aucun salon vocal actif');
            scheduleBell();
            return;
        }
        
        await playBell(channel);
        scheduleBell();
    }, delay);
}

client.once("ready", () => {
    console.log(`\n🤖 Bot: ${client.user.tag}`);
    console.log(`🔊 URL: ${SOUND_URL}\n`);
    scheduleBell();
});

client.login(WORKER_TOKEN);
```

## ✅ CE QUI VA SE PASSER :

1. ✅ **Installation rapide** (pas de compilation)
2. ✅ **Connexion stable** avec attentes
3. ✅ **Lecture garantie** avec délais de sécurité
4. ✅ **Logs clairs** sans spam

## 🚀 DÉPLOIE MAINTENANT :

1. Remplace les 3 fichiers
2. Commit sur GitHub
3. **Attends 2-3 minutes** que Railway compile
4. Regarde les logs

Tu devrais voir :
```
🤖 Bot: Sonnerie-1 | Jean Moulin#6054
🔊 URL: https://...
⏰ Prochaine sonnerie: ...
[BELL] Connexion à ...
[BELL] Connecté !
[BELL] ▶️ SON EN LECTURE
[BELL] Lecture terminée
