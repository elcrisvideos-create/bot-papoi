/**
 * BotPapoi2026 V6 100% PERFECTO - SIN VOLUMES - CON MONGODB
 * 
 * FIX DEFINITIVO del 2% que faltaba:
 * - Ya NO necesitas Volumes en Railway
 * - XP y TikTok se guardan en MongoDB Atlas (gratis, para siempre)
 * - Si no pones MONGO_URI, funciona igual con archivos como V5 (fallback)
 * 
 * PASOS PARA ACTIVARLO (2 minutos):
 * 1. Ve a https://www.mongodb.com/cloud/atlas -> Create Free Cluster
 * 2. Database Access -> Add User -> pon user/pass
 * 3. Network Access -> Add IP -> Allow All (0.0.0.0/0)
 * 4. Database -> Connect -> Drivers -> copia la URI (mongodb+srv://...)
 * 5. En Railway > tu servicio > Variables > New Variable -> MONGO_URI = tu URI
 * 6. npm install mongoose (añádelo a package.json)
 * 7. Deploy V6
 * 
 * Si no pones MONGO_URI, el bot funciona igual que V5 con archivos.
 */

const { Client, GatewayIntentBits, Partials, Events, REST, Routes, ChannelType, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// --- IA PAPOI V7 (GROQ) ---
let Groq = null;
let groq = null;
let aiCooldown = new Map();
const GROSIERIAS = ['verga','vrg','hdp','ptm','ctm','mierda','pito','puta','puto','chinga'];
try {
  Groq = require('groq-sdk');
  if(process.env.GROQ_API_KEY){
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log('✅ IA Papoi con Groq ACTIVA');
  } else {
    console.log('⚠ GROQ_API_KEY no encontrada - IA desactivada');
  }
} catch(e){
  console.log('⚠ groq-sdk no instalado - IA desactivada');
}

// --- MONGODB (NUEVO V6) ---
let mongoose = null;
let XpModel = null;
let TikTokModel = null;
let useMongo = false;

try {
  mongoose = require('mongoose');
} catch (e) {
  console.log('⚠️ mongoose no instalado, usando solo archivos (pon npm install mongoose)');
}

const CONFIG = {
  channels: {
    general: ['general'],
    bienvenida: ['bienvenida', 'welcome'],
    multimedia: ['multimedia'],
    clips: ['clips-tiktok', 'clips'],
    live: ['elcris-en-vivo', 'en-vivo', 'live'],
        pingRoles: ['ping-roles', '🔗 | ping-roles', '🔗│ping-roles'],
    butterfly: ['floracion-mariposas', 'floración-mariposas', 'mariposas', 'butterfly', 'butterfly-bloom', 'evento-mariposas'],
    apariciones: ['apariciones-en-vivo', 'ultimas-apariciones'],
    staffChat: ['chat staff', 'staff-chat', '💬 | chat-staff'],
    staffAnuncios: ['anuncios staff', 'anuncios-staff', '📢 | anuncios-staff'],
    staffLogs: ['logs tickets', 'tickets-logs', '🎫 | logs-tickets'],
        staffSanciones: ['sanciones', 'logs sanciones', '📝 | sanciones', 'sanciones-log', '📝 | sanciones-log'],
    fusiones: ['fusiones', '🔀│fusiones', '🔀 | fusiones', 'fusion'],
    fusionesLogs: ['fusiones-logs', 'logs-fusiones', '📋│fusiones-logs', 'fusiones-log'],
    chambeadoresRecluta: ['reclutamiento-chambeadores', '💼│reclutamiento-chambeadores', 'reclutamiento'],
    chambeadoresActivos: ['chambeadores-activos', '🥚│chambeadores-activos'],
    chambeadoresLogs: ['chambeadores-logs', '📋│chambeadores-logs', 'logs-chambeadores'],
    chambeadoresChat: ['chat-chambeadores', '💬│chat-chambeadores', 'chat chambeadores', 'chambeadores-chat'],
    apoyoInfo: ['como-apoyar', '📢│como-apoyar'],
    apoyoTienda: ['tienda-roblox', '🥚│tienda-roblox'],
    apoyoDonaciones: ['donaciones', '💸│donaciones'],
    apoyoLogs: ['apoyo-logs', '📋│apoyo-logs', 'donaciones-logs'],
    loungeVip: ['lounge-vip', '💬│lounge-vip'],
    chatLeyendas: ['chat-leyendas', '👑│chat-leyendas'],
    guias: ['guías', 'guias', '📚│guías-roba-un-huevo', '📚│guias-roba-un-huevo', '📖│guías', 'guías-roba-un-huevo']
  },
  categories: {
    robaHuevo: ['roba un huevo', 'roba'],
    staff: ['staff', '🔒 staff'],
    fusionesActivas: ['fusiones activas', '🔀 fusiones activas', 'fusiones'],
    apoyar: ['apoyar a esta comunidad', '💖 apoyar', 'apoyar'],
    vipDonadores: ['vip donadores', '💖 vip donadores', 'vip']
  }
};

function findChannel(guild, nameList) {
  const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildForum);
  const lowerNames = nameList.map(n => n.toLowerCase());
  for (const name of lowerNames) {
    const exact = channels.find(c => c.name.toLowerCase() === name);
    if (exact) return exact;
  }
  for (const name of lowerNames) {
    const incl = channels.find(c => c.name.toLowerCase().includes(name));
    if (incl) return incl;
  }
  return null;
}

function findCategory(guild, nameList) {
  const cats = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
  const lowerNames = nameList.map(n => n.toLowerCase());
  for (const name of lowerNames) {
    const exact = cats.find(c => c.name.toLowerCase() === name);
    if (exact) return exact;
  }
  for (const name of lowerNames) {
    const incl = cats.find(c => c.name.toLowerCase().includes(name));
    if (incl) return incl;
  }
  return null;
}

function findRole(guild, roleName) {
  return guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase()) || null;
}

function findStaffSancionesChannel(guild){
  return findChannel(guild, CONFIG.channels.staffSanciones);
}

async function logSancion(guild, { tipo, moderador, usuario, razon, duracion, extra }){
  try{
    const canal = findStaffSancionesChannel(guild);
    if(!canal) return;
    const colores = { BAN: 0xED4245, KICK: 0xFEE75C, MUTE: 0x5865F2, UNMUTE: 0x57F287, WARN: 0xF1C40F, CLEAR: 0x99AAB5 };
    const emojis = { BAN: '🔨', KICK: '👢', MUTE: '🔇', UNMUTE: '🔊', WARN: '⚠️', CLEAR: '🧹' };
    const embed = new EmbedBuilder()
     .setColor(colores[tipo] || 0xFFD700)
     .setTitle(`${emojis[tipo] || '📝'} ${tipo} | ${usuario?.tag || usuario}`)
     .setThumbnail(usuario?.displayAvatarURL? usuario.displayAvatarURL() : null)
     .addFields(
        { name: '👤 Usuario', value: `${usuario} (${usuario?.id || '?'})`, inline: true },
        { name: '👮 Moderador', value: `${moderador}`, inline: true },
        { name: '📄 Razón', value: (razon || 'Sin razón').slice(0, 1024) }
      )
     .setTimestamp();
    if(duracion) embed.addFields({ name: '⏱️ Duración', value: duracion, inline: true });
    if(extra) embed.addFields({ name: 'ℹ️ Extra', value: extra.slice(0, 1024) });
    await canal.send({ embeds: [embed] }).catch(e=>console.log(`logSancion fail: ${e.message}`));
  }catch(e){ console.log(`logSancion error: ${e.message}`); }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember]
});

// --- PERSISTENCIA V6: MONGODB + FALLBACK ARCHIVOS ---
const DATA_DIR = fs.existsSync('/data') ? '/data' : './';
const XP_PATH = path.join(DATA_DIR, 'xp.json');
const TIKTOK_PATH = path.join(DATA_DIR, 'tiktok.json');

function safeLoadJSON(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
      return defaultValue;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.log(`❌ Error leyendo ${filePath}: ${e.message}`);
    return defaultValue;
  }
}

function safeSaveJSON(filePath, data) {
  try {
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    fs.renameSync(tempPath, filePath);
  } catch (e) {
    console.log(`❌ Error guardando ${filePath}: ${e.message}`);
  }
}

let xpData = safeLoadJSON(XP_PATH, {});
let tiktokCache = safeLoadJSON(TIKTOK_PATH, { lastVideoId: null, isLiveNow: false });
const FUSIONES_PATH = path.join(DATA_DIR, 'fusiones.json');
const FUSIONES_ACTIVAS_PATH = path.join(DATA_DIR, 'fusiones_activas.json');
let fusionesQueue = safeLoadJSON(FUSIONES_PATH, []);
let fusionesActivasRaw = safeLoadJSON(FUSIONES_ACTIVAS_PATH, []);
let fusionesActivas = new Map(fusionesActivasRaw.map(o => [o.channelId, o]));
let FusionModel = null;
let FusionActivaModel = null;

const saveFusiones = async () => {
  safeSaveJSON(FUSIONES_PATH, fusionesQueue);
};
const saveFusionesActivas = async () => {
  const arr = [...fusionesActivas.values()];
  safeSaveJSON(FUSIONES_ACTIVAS_PATH, arr);
  if (useMongo && FusionActivaModel) {
    try { await FusionActivaModel.deleteMany({}); if(arr.length) await FusionActivaModel.insertMany(arr); } catch(e){ console.log('Error fusiones activas Mongo', e.message); }
  }
};

// --- CHAMBEADORES PERSISTENCIA ---
const CHAMBEADORES_PATH = path.join(DATA_DIR, 'chambeadores.json');
let chambeadoresData = safeLoadJSON(CHAMBEADORES_PATH, {});
let ChambeadorModel = null;

const DONADORES_PATH = path.join(DATA_DIR, 'donadores.json');
let donadoresData = safeLoadJSON(DONADORES_PATH, { users: {} });
let DonadorModel = null;
const saveChambeadores = async (soloUserId = null) => {
  safeSaveJSON(CHAMBEADORES_PATH, chambeadoresData);
  if (useMongo && ChambeadorModel) {
    try {
      if(soloUserId){
        const data = chambeadoresData[soloUserId];
        if(data) await ChambeadorModel.findOneAndUpdate({ userId: soloUserId }, {...data, userId: soloUserId }, { upsert: true });
      } else {
        for(const [userId, data] of Object.entries(chambeadoresData)){
          await ChambeadorModel.findOneAndUpdate({ userId }, {...data, userId }, { upsert: true });
        }
      }
    } catch(e){ console.log('Error chambeadores Mongo', e.message); }
  }
};

const saveDonadores = async (soloUserId = null) => {
  safeSaveJSON(DONADORES_PATH, donadoresData);
  if (useMongo && DonadorModel) {
    try {
      if(soloUserId){
        const d = donadoresData.users[soloUserId];
        if(d) await DonadorModel.findOneAndUpdate({ userId: soloUserId }, {...d, userId: soloUserId }, { upsert: true });
      } else {
        for(const [userId, d] of Object.entries(donadoresData.users)){
          await DonadorModel.findOneAndUpdate({ userId }, {...d, userId }, { upsert: true });
        }
      }
    } catch(e){ console.log('Error donadores Mongo', e.message); }
  }
};

async function initMongo() {
  if (!process.env.MONGO_URI || !mongoose) {
    console.log('📁 Usando archivos locales (sin MONGO_URI) - V5 mode');
    return;
  }
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB conectado - V6 100% perfecto activo');
    useMongo = true;

    const xpSchema = new mongoose.Schema({ userId: String, xp: Number });
    const tiktokSchema = new mongoose.Schema({ guildId: String, lastVideoId: String, isLiveNow: Boolean });
    
    XpModel = mongoose.model('Xp', xpSchema);
    TikTokModel = mongoose.model('TikTok', tiktokSchema);

    // Cargar XP de Mongo a memoria
    const allXp = await XpModel.find({});
    if (allXp.length > 0) {
      xpData = {};
      allXp.forEach(doc => { xpData[doc.userId] = doc.xp; });
      console.log(`✅ ${allXp.length} XP cargados desde MongoDB`);
      safeSaveJSON(XP_PATH, xpData); // Backup local también
    } else if (Object.keys(xpData).length > 0) {
      // Primera vez: migrar archivo a Mongo
      console.log('📤 Migrando xp.json a MongoDB...');
      for (const [userId, xp] of Object.entries(xpData)) {
        await XpModel.findOneAndUpdate({ userId }, { xp }, { upsert: true });
      }
    }

       // Cargar TikTok cache
    const guildId = process.env.GUILD_ID;
    let tiktokDoc = await TikTokModel.findOne({ guildId });
    if (tiktokDoc) {
      tiktokCache = { lastVideoId: tiktokDoc.lastVideoId, isLiveNow: tiktokDoc.isLiveNow };
      console.log(`✅ TikTok cache cargado desde 【entity-MongoDB¦canonical_name=MongoDB】: ${tiktokCache.lastVideoId}`);
      safeSaveJSON(TIKTOK_PATH, tiktokCache);
    } else if (tiktokCache.lastVideoId) {
      await TikTokModel.findOneAndUpdate({ guildId }, { lastVideoId: tiktokCache.lastVideoId, isLiveNow: tiktokCache.isLiveNow }, { upsert: true });
      console.log('📤 Migrando tiktok.json a 【entity-MongoDB¦canonical_name=MongoDB】...');
    }

    const fusionSchema = new mongoose.Schema({ userId: String, fusionId: String, have: String, robloxUser: String, messageId: String, channelId: String, createdAt: Number }, { strict: false });
    FusionModel = mongoose.model('Fusion', fusionSchema);
    const fusionesMongo = await FusionModel.find({});
    if(fusionesMongo.length > 0){
      fusionesQueue = fusionesMongo.map(d=>({ userId: d.userId, fusionId: d.fusionId, have: d.have, robloxUser: d.robloxUser, messageId: d.messageId, channelId: d.channelId, createdAt: d.createdAt }));
      console.log(`✅ ${fusionesQueue.length} fusiones cargadas desde MongoDB`);
      safeSaveJSON(FUSIONES_PATH, fusionesQueue);
    } else if(fusionesQueue.length > 0){
      await FusionModel.insertMany(fusionesQueue);
    }

    const fusionActivaSchema = new mongoose.Schema({ channelId: String, users: [String], fusionId: String, reqs: Array, createdAt: Number, confirms: [String] }, { strict: false });
    FusionActivaModel = mongoose.model('FusionActiva', fusionActivaSchema);
    const activasMongo = await FusionActivaModel.find({});
    if(activasMongo.length > 0){
      fusionesActivas = new Map(activasMongo.map(d=> [d.channelId, { channelId: d.channelId, users: d.users, fusionId: d.fusionId, reqs: d.reqs, createdAt: d.createdAt, confirms: d.confirms||[], lastPing: Date.now() }]));
      console.log(`✅ ${activasMongo.length} fusiones ACTIVAS cargadas desde MongoDB`);
      safeSaveJSON(FUSIONES_ACTIVAS_PATH, [...fusionesActivas.values()]);
    } else if(fusionesActivasRaw.length > 0){
      console.log(`📤 Migrando ${fusionesActivasRaw.length} fusiones activas a MongoDB...`);
      await FusionActivaModel.insertMany(fusionesActivasRaw).catch(()=>{});
    }

    const chambeadorSchema = new mongoose.Schema({ userId: String, robloxUser: String, puntos: Number, baneado: Boolean, lastReport: Number, createdAt: Number }, { strict: false });
    ChambeadorModel = mongoose.model('Chambeador', chambeadorSchema);
    const chambeadoresMongo = await ChambeadorModel.find({});
    if(chambeadoresMongo.length > 0){
      chambeadoresData = {};
      chambeadoresMongo.forEach(d=>{ chambeadoresData[d.userId] = { robloxUser: d.robloxUser, puntos: d.puntos||0, baneado: d.baneado||false, lastReport: d.lastReport||0, createdAt: d.createdAt||Date.now() }; });
      console.log(`✅ ${chambeadoresMongo.length} chambeadores cargados desde MongoDB`);
      safeSaveJSON(CHAMBEADORES_PATH, chambeadoresData);
    } else if(Object.keys(chambeadoresData).length > 0){
      for(const [userId, data] of Object.entries(chambeadoresData)){
        await ChambeadorModel.findOneAndUpdate({ userId }, {...data, userId }, { upsert: true });
      }
    }

    const donadorSchema = new mongoose.Schema({ userId: String, puntos: Number, totalRobux: Number, totalEfectivo: Number, fakes: Number, baneado: Boolean, createdAt: Number }, { strict: false });
    DonadorModel = mongoose.model('Donador', donadorSchema);
    const donadoresMongo = await DonadorModel.find({});
    if(donadoresMongo.length > 0){
      donadoresData.users = {};
      donadoresMongo.forEach(d=>{ donadoresData.users[d.userId] = { puntos: d.puntos||0, totalRobux: d.totalRobux||0, totalEfectivo: d.totalEfectivo||0, fakes: d.fakes||0, baneado: d.baneado||false, createdAt: d.createdAt||Date.now() }; });
      console.log(`✅ ${donadoresMongo.length} donadores cargados desde MongoDB`);
      safeSaveJSON(DONADORES_PATH, donadoresData);
    } else if(Object.keys(donadoresData.users).length > 0){
      for(const [userId, d] of Object.entries(donadoresData.users)){
        await DonadorModel.findOneAndUpdate({ userId }, {...d, userId }, { upsert: true });
      }
    }

  } catch (e) {
    console.error(`❌ Error MongoDB: ${e.message} - Usando archivos locales`);
    useMongo = false;
  }
}

const saveXP = async () => {
  safeSaveJSON(XP_PATH, xpData);
  if (useMongo && XpModel) {
    try {
      for (const [userId, xp] of Object.entries(xpData)) {
        await XpModel.findOneAndUpdate({ userId }, { xp }, { upsert: true });
      }
    } catch (e) {
      console.log(`Error guardando XP en Mongo: ${e.message}`);
    }
  }
};

const saveTikTok = async () => {
  safeSaveJSON(TIKTOK_PATH, tiktokCache);
  if (useMongo && TikTokModel) {
    try {
      await TikTokModel.findOneAndUpdate(
        { guildId: process.env.GUILD_ID }, 
        { lastVideoId: tiktokCache.lastVideoId, isLiveNow: tiktokCache.isLiveNow }, 
        { upsert: true }
      );
    } catch (e) {
      console.log(`Error guardando TikTok en Mongo: ${e.message}`);
    }
  }
};

const lastXP = new Map();
const commandCooldown = new Map();
// FIX V6.7 MEMORY LEAK - limpia Maps cada 15m
setInterval(()=>{
  const now = Date.now();
  for(const [k,v] of commandCooldown.entries()) if(now-v> 3600000) commandCooldown.delete(k);
  for(const [k,v] of aiCooldown.entries()) if(now-v> 60000) aiCooldown.delete(k);
  for(const [k,v] of lastXP.entries()) if(now-v> 3600000) lastXP.delete(k);
}, 15*60*1000);

const NIVELES = [
  { name: 'Papoi', xp: 0 },
  { name: 'Papoi Activo', xp: 500 },
  { name: 'Papoi Fiel', xp: 1500 },
  { name: 'Papoi Veterano', xp: 5000 },
  { name: 'Papoi Leyenda', xp: 15000 },
];
const SOLO_HOIST = ['papoi mayor','moderador','booster papoi','papoi leyenda','papoi veterano','papoi fiel','papoi activo','papoi'];
const PETS = {
  'Secreto': ['Starry Fox','RazorFang','Centaur','Gargoyle','Pure Jellyfish','Mutant Shark','Stag','Cosmic Dragon','Cosmic Skeleton Boss','Tralaledon','TRex','Kraken','Cerberus','Yeti','King Snake'],
  'Eterno': ['Celestial Sunlion','Skeleton Horse','Pegasus','Gorilla King','Oni Tiger','Eternal Lunar Dragon','Mosasaurus','El Maja','Lava Dragon','Phoenix','Ice Dragon'],
  'Divino': ['Royal Skywhale','World Burner','ArchAngel','Nightflame','Kitsune','Unicorn']
};
const CATEGORY_ROLES = {
  'Secreto': 'Huevo Secreto',
  'Eterno': 'Huevo Eterno',
  'Divino': 'Huevo Divino'
};
const CATEGORY_EMOJI = { Secreto: '🍀', Eterno: '🚀', Divino: '💎' }; // fallback si no encuentra custom
const CATEGORY_CUSTOM_NAME = { Secreto: 'huevo_secreto', Eterno: 'huevo_eterno', Divino: 'huevo_divino' };
const PET_EMOJI_MAP = {
  'Huevo Divino': 'huevo_divino',
  'Huevo Eterno': 'huevo_eterno',
  'Huevo Secreto': 'huevo_secreto',
  'Royal Skywhale': 'royal_skywhale',
  'World Burner': 'World_burner',
  'ArchAngel': 'arcangel',
  'Nightflame': 'nightflame',
  'Kitsune': 'kitsune',
  'Unicorn': 'unicornio',
  'Floración Mariposas': 'Mariposa',
  'Celestial Sunlion': 'Celestial_Sunlion',
  'Skeleton Horse': 'Skeleton_Horse',
  'Pegasus': 'Pegasus',
  'Gorilla King': 'Gorilla_King',
  'Oni Tiger': 'Oni_Tiger',
  'Eternal Lunar Dragon': 'Dragon_Lunar',
  'Mosasaurus': 'Mosasaurus',
  'El Maja': 'El_Maja',
  'Lava Dragon': 'Lava_Dragon',
  'Phoenix': 'Fenix',
  'Ice Dragon': 'Ice_Dragon',
  'Starry Fox': 'Starry_Fox',
  'RazorFang': 'RazorFang',
  'Centaur': 'Centaur',
  'Gargoyle': 'Gargoyle',
  'Pure Jellyfish': 'Pure_Jellyfish',
  'Mutant Shark': 'Mutant_Shark',
  'Stag': 'Stag',
  'Cosmic Dragon': 'Cosmic_Dragon',
  'Cosmic Skeleton Boss': 'Skeleton',
  'Tralaledon': 'Tralaledon',
  'TRex': 'T_Rex',
  'Kraken': 'Kraken',
  'Cerberus': 'Cerberus',
  'Yeti': 'Yeti',
  'King Snake': 'King_Snake'
};
function getCategoriaEmoji(guild, categoria){
  if(!guild) return CATEGORY_EMOJI[categoria];
  const name = CATEGORY_CUSTOM_NAME[categoria];
  const e = guild.emojis.cache.find(x => x.name.toLowerCase() === name);
  return e? `${e}` : CATEGORY_EMOJI[categoria];
}
function getPetEmoji(guild, petName){
  if(!guild) return null;
  const mapped = PET_EMOJI_MAP[petName];
  if(mapped){
    const exact = guild.emojis.cache.find(e => e.name.toLowerCase() === mapped.toLowerCase());
    if(exact) return exact;
  }
  const clean = petName.toLowerCase().replace(/\s+/g,'_');
  return guild.emojis.cache.find(e => e.name.toLowerCase() === clean || e.name.toLowerCase().includes(clean)) || null;
}
const ALL_PETS = [...PETS['Secreto'],...PETS['Eterno'],...PETS['Divino']];

// --- V8: EVENTO MARIPOSAS GLOBAL + AUTO-ROL ---
const BUTTERFLY_ROLE_NAME = 'Floración Mariposas';
const BUTTERFLY_EMOJI = '<:Mariposa:1556413173500739656>';
const BUTTERFLY_CHANNEL_NAME = '🦋 | floracion-mariposas';

// --- GUIAS FORO ---
const GUIAS_TAGS = [
  { name: '🟢 Principiantes', emoji: '🟢' },
  { name: '🥚 Huevos', emoji: '🥚' },
  { name: '🔔 Notificaciones', emoji: '🔔' },
  { name: '🔀 Fusiones', emoji: '🔀' },
  { name: '🦋 Mariposas', emoji: '🦋' },
  { name: '💼 Chambeadores', emoji: '💼' },
  { name: '💡 Trucos', emoji: '💡' },
];

// --- V9: FUSIONES - CONFIG FINAL ---
const FUSIONES = {
  angeles_eterna: { id: 'angeles_eterna', bioma: 'Angeles y Demonios', label: 'Eterna', emoji: '💀', pets: ['Skeleton Horse','Pegasus'], requiresBoth: false },
  angeles_divina: { id: 'angeles_divina', bioma: 'Angeles y Demonios', label: 'Divina', emoji: '😇', pets: ['ArchAngel','World Burner'], requiresBoth: false },
  enchanted: { id: 'enchanted', bioma: 'Enchanted Forest', label: 'Enchanted', emoji: '🌲', pets: ['Royal Skywhale','Celestial Sunlion'], requiresBoth: true }
};

// --- V10: CHAMBEADORES - CONFIG ---
const CHAMBEADORES_ROLES = {
  novato: '💼 Chambeador Novato',
  experimentado: '💼💼 Experimentado',
  veterano: '💼💼💼 Veterano',
  confianza: '👑 De Confianza',
  baneado: '🚫 Baneado Chambeador'
};
const CHAMBEADORES_HUEVOS_INTERES = {
  divinos: ['Royal Skywhale','World Burner','ArchAngel','Nightflame','Kitsune','Unicorn'],
  eternos: ['Celestial Sunlion','Skeleton Horse','Pegasus','Gorilla King','Oni Tiger']
};
const CHAMBEADORES_LINKS = {
  robloxProfile: 'https://www.roblox.com/es/users/10164957828/profile',
  comunidad: 'https://www.roblox.com/share/g/782782955',
  tiktok1: 'https://www.tiktok.com/@elcrisvideos/video/7690834090748087560',
  tiktok2: 'https://www.tiktok.com/@elcrisvideos/video/7688420085509213461'
};
const CHAMBEADORES_PAGO = { eterno: 100, divino: 200 };

// --- DONACIONES - CONFIG ---
const DONADOR_ROLES = {
  semilla: '🌱 Semilla Papoi',
  bronce: '🥉 Bronce Papoi',
  plata: '🥈 Plata Papoi',
  oro: '🥇 Oro Papoi',
  diamante: '💎 Diamante Papoi',
  leyenda: '👑 Leyenda Papoi',
  baneado: '🚫 Baneado Donador'
};
const DONADOR_PUNTOS = {
  semilla: 5,
  bronce: 50,
  plata: 200,
  oro: 500,
  diamante: 1000,
  leyenda: 5000
};
const DONADOR_TIENDA = [
  { id: '108532817912057', name: 'Papoi Black', price: 5, puntos: 5, url: 'https://www.roblox.com/es/catalog/108532817912057/Papoi-Black' }
  // Para agregar nueva solo agrega aquí: { id: '123456789', name: 'Papoi White', price: 25, puntos: 25, url: 'https://...' },
];
const DONADOR_LINKS = {
  perfil: 'https://www.roblox.com/es/users/10164957828/profile',
  grupoTienda: 'https://www.roblox.com/groups/782782955/store',
  kofi: 'https://ko-fi.com/papoiempire'
};

function isOwner(id){ return id === process.env.OWNER_ID; }
function isMod(member){
  if(!member) return false;
  if(isOwner(member.id)) return true;
  return member.roles.cache.some(r => ['papoi mayor','moderador'].includes(r.name.toLowerCase()));
}
function isPapoiMayor(member){
  if(!member) return false;
  if(isOwner(member.id)) return true;
  return member.roles.cache.some(r => r.name.toLowerCase() === 'papoi mayor');
}

function checkCooldown(userId, command, seconds) {
  const key = `${userId}-${command}`;
  const now = Date.now();
  const last = commandCooldown.get(key) || 0;
  if (now - last < seconds * 1000) {
    return Math.ceil((seconds * 1000 - (now - last)) / 1000);
  }
  commandCooldown.set(key, now);
  return 0;
}

// --- SCHEDULER GLOBAL CADA 30 MIN ---
let lastButterflyPingKey = null;
async function ensureButterflyRole(guild){
  let role = findRole(guild, BUTTERFLY_ROLE_NAME);
  if(!role){
    try{
      role = await guild.roles.create({ name: BUTTERFLY_ROLE_NAME, color: 0x8A2BE2, reason: 'Rol para evento Floración Mariposas :Mariposa:', mentionable: true });
      console.log(`✅ Rol auto-creado: ${BUTTERFLY_ROLE_NAME}`);
    }catch(e){ console.log('Error creando rol mariposas', e.message); return null; }
  }
  return role;
}

async function fixPapoisAlIniciar(guild){
  const rolPapoi = findRole(guild, 'papoi');
  if(!rolPapoi){ console.log('❌ No encontré rol papoi para fix'); return 0; }
  await guild.members.fetch().catch(()=>{});
  let fixed = 0;
  for(const [, m] of guild.members.cache){
    if(m.user.bot) continue;
    if(!m.roles.cache.has(rolPapoi.id)){
      await m.roles.add(rolPapoi.id).catch(()=>{});
      fixed++;
      await new Promise(r=>setTimeout(r, 350));
    }
  }
  if(fixed>0) console.log(`✅ FIX PAPOI: ${fixed} usuarios sin rol arreglados`);
  return fixed;
}

async function ensureFusionesChannel(guild){
  let canal = findChannel(guild, CONFIG.channels.fusiones);
  const modRole = findRole(guild, 'moderador');
  const mayorRole = findRole(guild, 'papoi mayor');

  if(canal){
    try{
      await canal.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: true, ReadMessageHistory: true, SendMessages: false }).catch(()=>{});
      await canal.permissionOverwrites.edit(client.user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, ManageMessages: true, AttachFiles: true, ManageChannels: true }).catch(()=>{});
      if(modRole) await canal.permissionOverwrites.edit(modRole.id, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, ManageMessages: true }).catch(()=>{});
      if(mayorRole) await canal.permissionOverwrites.edit(mayorRole.id, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, ManageMessages: true, ManageChannels: true }).catch(()=>{});
      await canal.setTopic('🔀 Centro de Fusiones - Solo el bot publica. Usa los botones. Prohibido @everyone').catch(()=>{});
    }catch{}
    return canal;
  }

  let categoria = findCategory(guild, CONFIG.categories.robaHuevo);
  const overwrites = [
    { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels] },
  ];
  if(modRole) overwrites.push({ id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] });
  if(mayorRole) overwrites.push({ id: mayorRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels] });

    canal = await guild.channels.create({
    name: '🔀│fusiones',
    type: ChannelType.GuildText,
    parent: categoria?.id || null,
    topic: '🔀 Centro de Fusiones - Solo el bot publica búsquedas. Usa los botones para buscar pareja. Prohibido @everyone.',
    permissionOverwrites: overwrites
  }).catch(()=>null);
  return canal;
}

async function ensureMultimediaChannel(guild){
  const canal = findChannel(guild, CONFIG.channels.multimedia);
  if(!canal) return;
  try{
    // agarra automático todos los que tienen 500 XP o más + mayor y moderador
    const rolesPermitidos = [...NIVELES.filter(n=>n.xp>=500).map(n=>n.name), 'papoi mayor', 'moderador'];
    await canal.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel:true, ReadMessageHistory:true, SendMessages:false }).catch(()=>{});
    const rolPapoiBase = findRole(guild, 'papoi');
    if(rolPapoiBase) await canal.permissionOverwrites.edit(rolPapoiBase.id, { ViewChannel:true, ReadMessageHistory:true, SendMessages:false }).catch(()=>{});
    for(const name of rolesPermitidos){
      const r = findRole(guild, name);
      if(r) await canal.permissionOverwrites.edit(r.id, { ViewChannel:true, ReadMessageHistory:true, SendMessages:true, AttachFiles:true, EmbedLinks:true }).catch(()=>{});
    }
    await canal.permissionOverwrites.edit(client.user.id, { ViewChannel:true, SendMessages:true, ManageMessages:true, ReadMessageHistory:true, EmbedLinks:true, AttachFiles:true }).catch(()=>{});
    await canal.setRateLimitPerUser(600).catch(()=>{});
  }catch{}
}

async function ensureChambeadorRoles(guild){
  const rolesToCreate = [
    { name: CHAMBEADORES_ROLES.novato, color: 0x2ECC71, reason: 'Rol Chambeador Novato' },
    { name: CHAMBEADORES_ROLES.experimentado, color: 0x3498DB, reason: 'Rol Chambeador Experimentado' },
    { name: CHAMBEADORES_ROLES.veterano, color: 0x9B59B6, reason: 'Rol Chambeador Veterano' },
    { name: CHAMBEADORES_ROLES.confianza, color: 0xF1C40F, reason: 'Rol Chambeador De Confianza' },
    { name: CHAMBEADORES_ROLES.baneado, color: 0xED4245, reason: 'Rol Chambeador Baneado' },
  ];
  for(const r of rolesToCreate){
    if(!findRole(guild, r.name)){
      await guild.roles.create({ name: r.name, color: r.color, reason: r.reason, mentionable: false }).catch(()=>{});
      await new Promise(res=>setTimeout(res, 300));
    }
  }
}

async function ensureChambeadoresChannels(guild){
  await ensureChambeadorRoles(guild);
  const ownerId = process.env.OWNER_ID;
  let categoria = findCategory(guild, CONFIG.categories.robaHuevo);
  const baneadoRole = findRole(guild, CHAMBEADORES_ROLES.baneado);
  const novatoRole = findRole(guild, CHAMBEADORES_ROLES.novato);
  const expRole = findRole(guild, CHAMBEADORES_ROLES.experimentado);
  const vetRole = findRole(guild, CHAMBEADORES_ROLES.veterano);
  const confRole = findRole(guild, CHAMBEADORES_ROLES.confianza);

  let recluta = findChannel(guild, CONFIG.channels.chambeadoresRecluta);
  if(!recluta){
    recluta = await guild.channels.create({
      name: '💼│reclutamiento-chambeadores',
      type: ChannelType.GuildText,
      parent: categoria?.id || null,
      topic: 'Reclutamiento Chambeadores - Solo bot publica. Registra tu @ de Roblox.',
      permissionOverwrites: [
        { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels] },
      ]
    }).catch(()=>null);
  }
  if(baneadoRole && recluta) await recluta.permissionOverwrites.edit(baneadoRole.id, { ViewChannel: false }).catch(()=>{});

  let activos = findChannel(guild, CONFIG.channels.chambeadoresActivos);
  if(activos && recluta && activos.id === recluta.id) activos = null;
  if(!activos){
    const overwritesActivos = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels] },
      { id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] },
    ];
    if(novatoRole) overwritesActivos.push({ id: novatoRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] });
    if(expRole) overwritesActivos.push({ id: expRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] });
    if(vetRole) overwritesActivos.push({ id: vetRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] });
    if(confRole) overwritesActivos.push({ id: confRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] });
    if(baneadoRole) overwritesActivos.push({ id: baneadoRole.id, deny: [PermissionFlagsBits.ViewChannel] });
    activos = await guild.channels.create({
      name: '🥚│chambeadores-activos',
      type: ChannelType.GuildText,
      parent: categoria?.id || null,
      topic: 'Solo chambeadores. Botón reporte + renunciar. Pago 100/200 Robux.',
      permissionOverwrites: overwritesActivos
    }).catch(()=>null);
  }

  // --- NUEVO CANAL CHAT CHAMBEADORES ---
  let chat = findChannel(guild, CONFIG.channels.chambeadoresChat);
  const overwritesChat = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels] },
    { id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels] },
  ];
  if(novatoRole) overwritesChat.push({ id: novatoRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] });
  if(expRole) overwritesChat.push({ id: expRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] });
  if(vetRole) overwritesChat.push({ id: vetRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] });
  if(confRole) overwritesChat.push({ id: confRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] });
  if(baneadoRole) overwritesChat.push({ id: baneadoRole.id, deny: [PermissionFlagsBits.ViewChannel] });

  if(!chat){
    chat = await guild.channels.create({
      name: '💬│chat-chambeadores',
      type: ChannelType.GuildText,
      parent: categoria?.id || null,
      topic: '💬 Chat exclusivo chambeadores - Dudas con el Papoi Mayor - Slowmode 30s',
      rateLimitPerUser: 30,
      permissionOverwrites: overwritesChat
    }).catch(()=>null);
  } else {
    await chat.setRateLimitPerUser(30).catch(()=>{});
    try{
      await chat.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false }).catch(()=>{});
      await chat.permissionOverwrites.edit(client.user.id, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, ManageMessages: true, ManageChannels: true }).catch(()=>{});
      await chat.permissionOverwrites.edit(ownerId, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, ManageMessages: true, ManageChannels: true }).catch(()=>{});
      if(baneadoRole) await chat.permissionOverwrites.edit(baneadoRole.id, { ViewChannel: false }).catch(()=>{});
      if(novatoRole) await chat.permissionOverwrites.edit(novatoRole.id, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true }).catch(()=>{});
      if(expRole) await chat.permissionOverwrites.edit(expRole.id, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true }).catch(()=>{});
      if(vetRole) await chat.permissionOverwrites.edit(vetRole.id, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true }).catch(()=>{});
      if(confRole) await chat.permissionOverwrites.edit(confRole.id, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true }).catch(()=>{});
    }catch{}
  }

  let logs = findChannel(guild, CONFIG.channels.chambeadoresLogs);
  if(!logs){
    logs = await guild.channels.create({
      name: '📋│chambeadores-logs',
      type: ChannelType.GuildText,
      parent: null,
      topic: 'Logs privados Chambeadores - SOLO OWNER',
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages] },
        { id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      ]
    }).catch(()=>null);
  }
  return { recluta, activos, chat, logs };
}

function getRangoDonador(puntos){
  if(puntos >= DONADOR_PUNTOS.leyenda) return DONADOR_ROLES.leyenda;
  if(puntos >= DONADOR_PUNTOS.diamante) return DONADOR_ROLES.diamante;
  if(puntos >= DONADOR_PUNTOS.oro) return DONADOR_ROLES.oro;
  if(puntos >= DONADOR_PUNTOS.plata) return DONADOR_ROLES.plata;
  if(puntos >= DONADOR_PUNTOS.bronce) return DONADOR_ROLES.bronce;
  if(puntos >= DONADOR_PUNTOS.semilla) return DONADOR_ROLES.semilla;
  return null;
}
async function ensureDonadorRoles(guild){
  const rolesToCreate = [
    { name: DONADOR_ROLES.semilla, color: 0x2ECC71, reason: 'Rol Donador Semilla' },
    { name: DONADOR_ROLES.bronce, color: 0xCD7F32, reason: 'Rol Donador Bronce' },
    { name: DONADOR_ROLES.plata, color: 0x95A5A6, reason: 'Rol Donador Plata' },
    { name: DONADOR_ROLES.oro, color: 0xF1C40F, reason: 'Rol Donador Oro' },
    { name: DONADOR_ROLES.diamante, color: 0x00FFFF, reason: 'Rol Donador Diamante' },
    { name: DONADOR_ROLES.leyenda, color: 0xFF00FF, reason: 'Rol Donador Leyenda' },
    { name: DONADOR_ROLES.baneado, color: 0x2C2F33, reason: 'Rol Baneado Donador' },
  ];
  for(const r of rolesToCreate){
    if(!findRole(guild, r.name)){
      await guild.roles.create({ name: r.name, color: r.color, reason: r.reason, mentionable: false }).catch(()=>{});
      await new Promise(res=>setTimeout(res, 300));
    }
  }
}
async function actualizarRolDonador(guild, member, puntos){
  try{
    const roles = Object.values(DONADOR_ROLES).filter(r=>r!==DONADOR_ROLES.baneado);
    for(const rn of roles){
      const ro = findRole(guild, rn);
      if(ro && member.roles.cache.has(ro.id)) await member.roles.remove(ro.id).catch(()=>{});
    }
    const nuevo = getRangoDonador(puntos);
    if(!nuevo) return;
    const rolNuevo = findRole(guild, nuevo);
    if(rolNuevo) await member.roles.add(rolNuevo).catch(()=>{});
  }catch{}
}
async function ensureApoyoCategory(guild){
  await ensureDonadorRoles(guild);
  const ownerId = process.env.OWNER_ID;
  let categoria = findCategory(guild, CONFIG.categories.apoyar);
  if(!categoria){
    categoria = await guild.channels.create({ name: '💖 Apoyar a esta Comunidad', type: ChannelType.GuildCategory }).catch(()=>null);
  }
  const makeOverwritesBase = [
    { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels] },
    { id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
  ];
  const createIfNotExists = async (nameList, name, topic) => {
    let ch = findChannel(guild, nameList);
    if(!ch){
      ch = await guild.channels.create({ name, type: ChannelType.GuildText, parent: categoria?.id, topic, permissionOverwrites: makeOverwritesBase }).catch(()=>null);
    } else {
      if(categoria && ch.parentId!== categoria.id) await ch.setParent(categoria.id).catch(()=>{});
    }
    return ch;
  };
  const info = await createIfNotExists(CONFIG.channels.apoyoInfo, '📢│como-apoyar', 'Cómo apoyar a Papois Empire');
  const tienda = await createIfNotExists(CONFIG.channels.apoyoTienda, '🥚│tienda-【entity-roblox¦canonical_name=Roblox】', 'Tienda oficial');
  const donas = await createIfNotExists(CONFIG.channels.apoyoDonaciones, '💸│donaciones', 'Donaciones anónimas');
  let logs = findChannel(guild, CONFIG.channels.apoyoLogs);
  if(!logs){
    logs = await guild.channels.create({
      name: '📋│apoyo-logs', type: ChannelType.GuildText, parent: null, topic: 'Logs privados donaciones - SOLO OWNER',
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages] },
        { id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      ]
    }).catch(()=>null);
  }
  return { categoria, info, tienda, donas, logs };
}
async function ensureVipDonadoresCategory(guild){
  await ensureDonadorRoles(guild);
  const ownerId = process.env.OWNER_ID;
  let categoria = findCategory(guild, CONFIG.categories.vipDonadores);
  if(!categoria){
    categoria = await guild.channels.create({ name: '💖 VIP DONADORES', type: ChannelType.GuildCategory }).catch(()=>null);
  }
  const semillaRole = findRole(guild, DONADOR_ROLES.semilla);
  const bronceRole = findRole(guild, DONADOR_ROLES.bronce);
  const plataRole = findRole(guild, DONADOR_ROLES.plata);
  const oroRole = findRole(guild, DONADOR_ROLES.oro);
  const diamanteRole = findRole(guild, DONADOR_ROLES.diamante);
  const leyendaRole = findRole(guild, DONADOR_ROLES.leyenda);
  const baneadoRole = findRole(guild, DONADOR_ROLES.baneado);
  const donorRoles = [semillaRole, bronceRole, plataRole, oroRole, diamanteRole, leyendaRole].filter(Boolean);
  let lounge = findChannel(guild, CONFIG.channels.loungeVip);
  if(lounge){ await lounge.setRateLimitPerUser(0).catch(()=>{}); }
  if(!lounge){
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages] },
      { id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
    ];
    donorRoles.forEach(r=> overwrites.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] }));
    if(baneadoRole) overwrites.push({ id: baneadoRole.id, deny: [PermissionFlagsBits.ViewChannel] });
    lounge = await guild.channels.create({ name: '💬│lounge-vip', type: ChannelType.GuildText, parent: categoria?.id || null, topic: '💬 Lounge VIP - Sin cooldown - Solo donadores', rateLimitPerUser: 0, permissionOverwrites: overwrites }).catch(()=>null);
  }
  let leyendas = findChannel(guild, CONFIG.channels.chatLeyendas);
  if(!leyendas){
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels] },
      { id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
    ];
    if(leyendaRole) overwrites.push({ id: leyendaRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] });
    leyendas = await guild.channels.create({ name: '👑│chat-leyendas', type: ChannelType.GuildText, parent: categoria?.id || null, topic: '👑 Solo Leyenda Papoi - Sin restricciones', rateLimitPerUser: 0, permissionOverwrites: overwrites }).catch(()=>null);
  }
  return { categoria, lounge, leyendas };
}
async function crearPanelApoyo(guild){
  const { info, tienda } = await ensureApoyoCategory(guild);
  if(!info) return;
  try{
    const msgs = await info.messages.fetch({ limit: 20 }).catch(()=>null);
    if(msgs){
      const old = msgs.filter(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('APOYAR'));
      for(const m of old.values()){ await m.delete().catch(()=>{}); await new Promise(r=>setTimeout(r,250)); }
    }
  }catch{}
  const embed1 = new EmbedBuilder().setColor(0xFF69B4).setTitle('💖 APOYAR A PAPOIS EMPIRE').setDescription(`Esta comunidad sigue viva y creciendo gracias a ustedes.\nCada Robux y cada donación se destina a **contratar más moderadores, crear sorteos de Robux para todos y mantener la comunidad segura y siempre actualizada.**\n\n💛 **SI LA COMUNIDAD TE HA APORTADO ALGO**\nSi aquí conseguiste tu huevo soñado, hiciste amigos, te reíste o simplemente te la pasas bien...\n\nPuedes agradecerlo con lo que quieras, desde 5 Robux o lo mínimo en donación. De corazón, todo se agradece muchísimo.\n\n**Recuerda que ElCris trata de mejorarla todos los días para que siempre esté actualizada para ustedes.** 👑\n\nNo es obligatorio, pero si lo haces te vuelves parte del corazón de este imperio.`).setThumbnail(guild.iconURL()).setTimestamp();
  const embed2 = new EmbedBuilder().setColor(0xF1C40F).setTitle('🥚 Opción 1 - Ropa de la Comunidad').setDescription(`Compra cualquier playera en nuestro grupo. **Todo el Robux va directo a fondos del grupo para sorteos.**\n\n**Tienda actual:**\n${DONADOR_TIENDA.map(t=>`• [${t.name} - ${t.price} R$](${t.url})`).join('\n')}\n\nPuedes ver quién la compró en el historial del grupo.`);
  const embed3 = new EmbedBuilder().setColor(0x2ECC71).setTitle('💸 Opción 2 - Donar Robux Directo a @elcrispapoi').setDescription(`¿Quieres mandarme Robux directo a mí y no al grupo? Roblox ya puso botón directo:\n\n**1️⃣** Entra a mi perfil:\n${DONADOR_LINKS.perfil}\n**2️⃣** Dale al botón 💸 **Donar / Enviar Robux**\n**3️⃣** Elige: 5, 10, 50, 100, 1000 R$\n**4️⃣** Confirma\n\n✅ **Requisito:** Solo necesitas **Roblox Plus** activo. Si no tienes Plus no te sale el botón.\n\n💡 El Robux me llega en 3-7 días y lo verifico en Mis Transacciones.`);
    const embed4 = new EmbedBuilder().setColor(0x5865F2).setTitle('💵 Opción 3 - Donación en Efectivo (Anónima)').setDescription(`Para sorteos grandes y mantener el bot/server. **100% anónimo**.\n\n**Ko-fi:** [${DONADOR_LINKS.kofi}](${DONADOR_LINKS.kofi}) (tarjeta, 【entity-PayPal¦canonical_name=PayPal】 y 【entity-OXXO¦canonical_name=OXXO】 vía Stripe)\n\nSube tu comprobante en el ticket y te damos tu rol.`);
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('apoyo_yo_apoye').setLabel('💖 Yo Apoyé al Canal - Verificar mi apoyo').setStyle(ButtonStyle.Success));
  await info.send({ embeds: [embed1, embed2, embed3, embed4], components: [row] }).catch(()=>{});
  const embedTienda = new EmbedBuilder().setColor(0xF1C40F).setTitle('🥚 Tienda Oficial 【entity-Roblox¦canonical_name=Roblox】').setDescription(`**Compra aquí y el Robux va al grupo:**\n${DONADOR_TIENDA.map(t=>`• **${t.name}** - ${t.price} R$ - [Ver](${t.url}) - +${t.puntos} pts`).join('\n')}\n\n**Grupo:** ${DONADOR_LINKS.grupoTienda}\n**Perfil:** ${DONADOR_LINKS.perfil}`);
  const rowTienda = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('🛒 Ver Tienda Comunidad').setStyle(ButtonStyle.Link).setURL(DONADOR_LINKS.grupoTienda), new ButtonBuilder().setLabel('👤 Ver Mi Perfil').setStyle(ButtonStyle.Link).setURL(DONADOR_LINKS.perfil));
  try{
    const msgs2 = await tienda.messages.fetch({ limit: 20 }).catch(()=>null);
    if(msgs2){ const old2 = msgs2.filter(m => m.author.id === client.user.id); for(const m of old2.values()){ await m.delete().catch(()=>{}); await new Promise(r=>setTimeout(r,250)); } }
  }catch{}
  await tienda.send({ embeds: [embedTienda], components: [rowTienda] }).catch(()=>{});
}
async function handleApoyoInteraction(inter){
  const guild = inter.guild;
  try{
    if(inter.isButton()){
      if(inter.customId === 'apoyo_yo_apoye'){
        if(donadoresData.users[inter.user.id]?.baneado) return inter.reply({ content: '🚫 Estás baneado del sistema de donaciones.', flags: MessageFlags.Ephemeral });
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('apoyo_select_tipo').setPlaceholder('¿Cómo apoyaste?').addOptions({ label: 'Compré ropa de la comunidad', value: 'ropa', emoji: '🥚', description: 'Playera del grupo' }, { label: 'Doné Robux directo a @elcrispapoi', value: 'robux_directo', emoji: '💸', description: 'Botón Donar del perfil (Plus)' }, { label: 'Donación en efectivo', value: 'efectivo', emoji: '💵', description: 'Ko-fi / PayPal / OXXO' }));
        return inter.reply({ content: '💖 **¿Cómo apoyaste?** Elige abajo y te creo un ticket privado solo para ti y el dueño.', components: [row], flags: MessageFlags.Ephemeral });
      }
      if(inter.customId.startsWith('apoyo_confirm_')){
        if(!isOwner(inter.user.id)) return inter.reply({ content: '❌ Solo owner.', flags: MessageFlags.Ephemeral });
        const userId = inter.customId.split('_')[2]; const puntos = parseInt(inter.customId.split('_')[3]||'0'); const tipo = inter.customId.split('_')[4]||'donacion';
        if(!donadoresData.users[userId]) donadoresData.users[userId] = { puntos: 0, totalRobux: 0, totalEfectivo: 0, fakes: 0, baneado: false, createdAt: Date.now() };
        donadoresData.users[userId].puntos += puntos;
        if(tipo==='ropa' || tipo==='robux_directo') donadoresData.users[userId].totalRobux += puntos; else donadoresData.users[userId].totalEfectivo += puntos;
        await saveDonadores(userId);
        const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(()=>null);
        if(member) await actualizarRolDonador(guild, member, donadoresData.users[userId].puntos);
        await inter.reply({ content: `✅ Confirmado <@${userId}> +${puntos} pts (${tipo}). Total: ${donadoresData.users[userId].puntos} pts -> ${getRangoDonador(donadoresData.users[userId].puntos)||'Sin rol aún'}` });
        setTimeout(()=> inter.channel.delete().catch(()=>{}), 5000); return;
      }
      if(inter.customId.startsWith('apoyo_mentira_')){
        if(!isOwner(inter.user.id)) return inter.reply({ content: '❌ Solo owner.', flags: MessageFlags.Ephemeral });
        const userId = inter.customId.split('_')[2];
        if(!donadoresData.users[userId]) donadoresData.users[userId] = { puntos: 0, totalRobux: 0, totalEfectivo: 0, fakes: 0, baneado: false, createdAt: Date.now() };
        donadoresData.users[userId].fakes = (donadoresData.users[userId].fakes||0)+1; await saveDonadores(userId);
        if(donadoresData.users[userId].fakes >= 3){
          donadoresData.users[userId].baneado = true; await saveDonadores(userId);
          const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(()=>null);
          if(member){ const banRole = findRole(guild, DONADOR_ROLES.baneado); if(banRole) await member.roles.add(banRole).catch(()=>{}); }
          await inter.reply({ content: `🚫 <@${userId}> 3 fakes -> baneado del sistema donador.` });
        } else { await inter.reply({ content: `❌ Marcado como mentira <@${userId}> - Fake ${donadoresData.users[userId].fakes}/3` }); }
        setTimeout(()=> inter.channel.delete().catch(()=>{}), 5000); return;
      }
      if(inter.customId.startsWith('apoyo_modificar_')){
        if(!isOwner(inter.user.id)) return inter.reply({ content: '❌ Solo owner.', flags: MessageFlags.Ephemeral });
        const userId = inter.customId.split('_')[2];
        const modal = new ModalBuilder().setCustomId(`modal_apoyo_modificar_${userId}`).setTitle('Modificar cantidad real');
        const input = new TextInputBuilder().setCustomId('cantidadReal').setLabel('Cantidad real (puntos)').setPlaceholder('Ej: 5, 25, 100').setStyle(TextInputStyle.Short).setRequired(true);
        const inputTipo = new TextInputBuilder().setCustomId('tipoReal').setLabel('Tipo: ropa / robux_directo / efectivo').setPlaceholder('ropa').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input), new ActionRowBuilder().addComponents(inputTipo));
        return inter.showModal(modal);
      }
    }
    if(inter.isStringSelectMenu()){
      if(inter.customId === 'apoyo_select_tipo'){
        const tipo = inter.values[0];
        if(tipo === 'ropa'){
          const options = DONADOR_TIENDA.map(t=> ({ label: `${t.name} - ${t.price} R$`, value: `ropa_${t.id}_${t.puntos}`, description: `+${t.puntos} pts`, emoji: '🥚' }));
          options.push({ label: 'Otra cantidad / Otra playera', value: 'ropa_otra', description: 'Especificar manualmente', emoji: '✏' });
          const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('apoyo_select_ropa').setPlaceholder('¿Qué ropa compraste?').addOptions(options.slice(0,25)));
          return inter.update({ content: '🥚 **¿Qué ropa compraste?**', components: [row] });
        } else if(tipo === 'robux_directo'){
          const modal = new ModalBuilder().setCustomId('modal_apoyo_robux').setTitle('Donación Robux Directa');
          const cant = new TextInputBuilder().setCustomId('cantidad').setLabel('¿Cuánto Robux donaste?').setPlaceholder('Ej: 100').setStyle(TextInputStyle.Short).setRequired(true);
          const userRoblox = new TextInputBuilder().setCustomId('robloxUser').setLabel('Tu user de 【entity-Roblox¦canonical_name=Roblox】').setPlaceholder('Ej: Joss123').setStyle(TextInputStyle.Short).setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(cant), new ActionRowBuilder().addComponents(userRoblox));
          return inter.showModal(modal);
        } else if(tipo === 'efectivo'){
          const modal = new ModalBuilder().setCustomId('modal_apoyo_efectivo').setTitle('Donación Efectivo');
          const cant = new TextInputBuilder().setCustomId('cantidad').setLabel('¿Cuánto donaste? Ej: 50 MXN / 5 USD').setPlaceholder('50 MXN').setStyle(TextInputStyle.Short).setRequired(true);
          const metodo = new TextInputBuilder().setCustomId('metodo').setLabel('¿Por dónde? Ko-fi / PayPal / OXXO').setPlaceholder('Ko-fi').setStyle(TextInputStyle.Short).setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(cant), new ActionRowBuilder().addComponents(metodo));
          return inter.showModal(modal);
        }
      }
      if(inter.customId === 'apoyo_select_ropa'){
        const val = inter.values[0];
        if(val === 'ropa_otra'){
          const modal = new ModalBuilder().setCustomId('modal_apoyo_ropa_otra').setTitle('Ropa - Otra cantidad');
          const cant = new TextInputBuilder().setCustomId('cantidad').setLabel('¿Cuánto costó la ropa?').setPlaceholder('Ej: 10').setStyle(TextInputStyle.Short).setRequired(true);
          const cual = new TextInputBuilder().setCustomId('cual').setLabel('¿Cuál ropa? Nombre o ID').setPlaceholder('Papoi Black').setStyle(TextInputStyle.Short).setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(cant), new ActionRowBuilder().addComponents(cual));
          return inter.showModal(modal);
        } else {
          const parts = val.split('_'); const puntos = parseInt(parts[2]||'0'); const id = parts[1];
          const tiendaItem = DONADOR_TIENDA.find(t=>t.id===id);
          await inter.deferReply({ flags: MessageFlags.Ephemeral });
          const categoria = findCategory(guild, CONFIG.categories.apoyar) || guild.channels.cache.filter(c=>c.type===ChannelType.GuildCategory).first();
          const ownerId = process.env.OWNER_ID;
          const ticket = await guild.channels.create({ name: `🎫│donacion-${inter.user.username.slice(0,10)}-${Date.now().toString().slice(-4)}`, type: ChannelType.GuildText, parent: categoria?.id || null, topic: `Ticket donación ${inter.user.id} - ropa ${id} - ${puntos} pts`, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: inter.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }, { id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] }, { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages] }] }).catch(()=>null);
          if(!ticket) return inter.editReply({ content: '❌ No pude crear ticket.' });
          const embed = new EmbedBuilder().setColor(0xF1C40F).setTitle('🥚 Ticket Ropa - Verificación').setDescription(`**Usuario:** <@${inter.user.id}> (${inter.user.id})\n**Tipo:** Ropa comunidad\n**Item:** ${tiendaItem? tiendaItem.name : id} - ${puntos} pts\n**Link:** ${tiendaItem? tiendaItem.url : 'No registrado'}\n\n**Instrucciones para el usuario:** Sube aquí tu captura de compra donde se vea tu nombre de Roblox.\n\n**Para Owner:** Verifica en https://www.roblox.com/groups/782782955/store > Sales`).setTimestamp();
          const rowOwner = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`apoyo_confirm_${inter.user.id}_${puntos}_ropa`).setLabel('✅ Confirmar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`apoyo_mentira_${inter.user.id}`).setLabel('❌ Mentira').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`apoyo_modificar_${inter.user.id}`).setLabel('✏ Modificar cantidad').setStyle(ButtonStyle.Secondary));
          await ticket.send({ content: `<@${ownerId}> nuevo ticket ropa`, embeds: [embed], components: [rowOwner] }).catch(()=>{});
          return inter.editReply({ content: `✅ Ticket creado: ${ticket} - Sube tu evidencia ahí.` });
        }
      }
    }
    if(inter.isModalSubmit()){
      if(inter.customId === 'modal_apoyo_robux' || inter.customId === 'modal_apoyo_efectivo' || inter.customId.startsWith('modal_apoyo_ropa')){
        await inter.deferReply({ flags: MessageFlags.Ephemeral });
        const cantidadRaw = inter.fields.getTextInputValue('cantidad')?.trim() || '0';
        const puntosMatch = cantidadRaw.match(/(\d+)/); let puntos = puntosMatch? parseInt(puntosMatch[1]) : 0;
        if(inter.customId === 'modal_apoyo_efectivo'){ const lower = cantidadRaw.toLowerCase(); if(lower.includes('usd') || (lower.includes('$') &&!lower.includes('mxn'))) puntos = puntos * 60; else if(lower.includes('mxn')) puntos = puntos * 3; }
        const categoria = findCategory(guild, CONFIG.categories.apoyar) || guild.channels.cache.filter(c=>c.type===ChannelType.GuildCategory).first();
        const ownerId = process.env.OWNER_ID;
        const tipo = inter.customId.includes('robux')? 'robux_directo' : inter.customId.includes('efectivo')? 'efectivo' : 'ropa';
        const robloxUser = inter.fields.getTextInputValue('robloxUser')?.trim() || inter.fields.getTextInputValue('cual')?.trim() || inter.fields.getTextInputValue('metodo')?.trim() || 'N/A';
        const ticket = await guild.channels.create({ name: `🎫│donacion-${inter.user.username.slice(0,10)}-${Date.now().toString().slice(-4)}`, type: ChannelType.GuildText, parent: categoria?.id || null, topic: `Ticket donación ${inter.user.id} - ${tipo} - ${puntos} pts`, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: inter.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }, { id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] }, { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages] }] }).catch(()=>null);
        if(!ticket) return inter.editReply({ content: '❌ No pude crear ticket.' });
        const embed = new EmbedBuilder().setColor(tipo==='efectivo'? 0x5865F2 : 0x2ECC71).setTitle(tipo==='robux_directo'? '💸 Ticket Robux Directo' : tipo==='efectivo'? '💵 Ticket Efectivo' : '🥚 Ticket Ropa').setDescription(`**Usuario:** <@${inter.user.id}> (${inter.user.id})\n**Tipo:** ${tipo}\n**Cantidad declarada:** ${cantidadRaw} -> **${puntos} pts**\n**Dato extra:** ${robloxUser}\n\n**Instrucciones usuario:** Sube captura/comprobante aquí.\n\n${tipo==='robux_directo'? `**Verificar en:** ${DONADOR_LINKS.perfil} > Transacciones` : tipo==='ropa'? `**Verificar en:** Grupo > Sales` : `**Verificar en:** Ko-fi Dashboard`}`).setTimestamp();
        const rowOwner = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`apoyo_confirm_${inter.user.id}_${puntos}_${tipo}`).setLabel('✅ Confirmar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`apoyo_mentira_${inter.user.id}`).setLabel('❌ Mentira').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`apoyo_modificar_${inter.user.id}`).setLabel('✏ Modificar cantidad').setStyle(ButtonStyle.Secondary));
        await ticket.send({ content: `<@${ownerId}> nuevo ticket ${tipo}`, embeds: [embed], components: [rowOwner] }).catch(()=>{});
        return inter.editReply({ content: `✅ Ticket creado: ${ticket} - Sube tu evidencia ahí.` });
      }
      if(inter.customId.startsWith('modal_apoyo_modificar_')){
        const userId = inter.customId.replace('modal_apoyo_modificar_',''); const cantidadReal = parseInt(inter.fields.getTextInputValue('cantidadReal')?.trim()||'0'); const tipoReal = inter.fields.getTextInputValue('tipoReal')?.trim()||'ropa';
        if(!donadoresData.users[userId]) donadoresData.users[userId] = { puntos: 0, totalRobux: 0, totalEfectivo: 0, fakes: 0, baneado: false, createdAt: Date.now() };
        donadoresData.users[userId].puntos += cantidadReal;
        if(tipoReal.includes('ropa') || tipoReal.includes('robux')) donadoresData.users[userId].totalRobux += cantidadReal; else donadoresData.users[userId].totalEfectivo += cantidadReal;
        await saveDonadores(userId);
        const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(()=>null);
        if(member) await actualizarRolDonador(guild, member, donadoresData.users[userId].puntos);
        await inter.reply({ content: `✅ Modificado y confirmado <@${userId}> +${cantidadReal} pts (${tipoReal}). Total: ${donadoresData.users[userId].puntos}` });
        setTimeout(()=> inter.channel.delete().catch(()=>{}), 5000); return;
      }
    }
  }catch(e){ console.log('Apoyo error', e); if(!inter.replied) inter.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral }).catch(()=>{}); }
}

async function ensureGuiasChannel(guild){
  let canal = findChannel(guild, CONFIG.channels.guias);
  if(canal && canal.type === ChannelType.GuildForum) return canal;
  let categoria = findCategory(guild, CONFIG.categories.robaHuevo);
  const modRole = findRole(guild, 'moderador');
  const mayorRole = findRole(guild, 'papoi mayor');
  const availableTags = GUIAS_TAGS.map(t => ({ name: t.name, moderated: false, emoji: { name: t.emoji } }));
  const overwrites = [
    { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessagesInThreads], deny: [PermissionFlagsBits.SendMessages] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.SendMessagesInThreads] },
  ];
  if(modRole) overwrites.push({ id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.ManageMessages] });
  if(mayorRole) overwrites.push({ id: mayorRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels] });
  try{
    canal = await guild.channels.create({
      name: '📚│guías-roba-un-huevo',
      type: ChannelType.GuildForum,
      parent: categoria?.id || null,
      topic: '📚 Guías oficiales de Roba un Huevo - Solo el bot publica guías, tú preguntas en comentarios',
      availableTags: availableTags,
      defaultReactionEmoji: { name: '💡' },
      permissionOverwrites: overwrites
    });
    console.log(`✅ Foro guías creado: ${canal.name}`);
  }catch(e){ console.log('Error creando foro guias', e.message); return null; }
  return canal;
}

async function crearPostGuia(guild, { titulo, categoriaTag, descripcion, files }){
  const canal = await ensureGuiasChannel(guild);
  if(!canal) return null;
  const tagObj = canal.availableTags.find(t => t.name.toLowerCase().includes(categoriaTag.toLowerCase())) || canal.availableTags.find(t => categoriaTag.toLowerCase().includes(t.name.toLowerCase().split(' ')[1]));
  const finalTagId = tagObj? tagObj.id : (canal.availableTags[0]?.id || null);
  const embed = new EmbedBuilder()
   .setColor(0xFFD700)
   .setTitle(`📚 ${titulo}`)
   .setDescription(descripcion.slice(0, 4000))
   .setThumbnail(guild.iconURL())
   .setFooter({ text: `Guía Papoi • ${categoriaTag} • ${new Date().toLocaleDateString('es-MX')}` })
   .setTimestamp();
  const filePayload = (files||[]).map(f => ({ attachment: f.url, name: f.name }));
  try{
    const thread = await canal.threads.create({
      name: `${GUIAS_TAGS.find(t=>t.name.includes(categoriaTag))?.emoji || '📚'} ${titulo}`.slice(0, 95),
      appliedTags: finalTagId? [finalTagId] : [],
      message: { embeds: [embed], files: filePayload }
    });
    return thread;
  }catch(e){ console.log('crearPostGuia error', e.message); return null; }
}

function isMensajeFusionesEnGeneral(msg){
  if(!msg.guild) return false;
  const name = msg.channel.name.toLowerCase();
  if(name.includes('fusiones') || name.includes('fusion-')) return false;
  // Quita acentos para que fusión = fusion
  let txt = msg.content.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");

  const claves = [
    'fusion','fucion','fuscion','fussion','fushion','fusiom','fusi0n','fucio','ritual','rituals','ritualito','rituall','ritial','rritual',
    'pegasus','pegaso','pegasu','pegaus','skeleton','esqueleto','eskelet','skelet','skel','caballo','esquelet',
    'archangel','world burner','world','skywhale','sunlion','celestial','eterna','divina','enchanted','juntar','combinar','mezclar'
  ];
  const verbos = ['tengo','tenqo','busco','buscko','bucso','necesito','nesesito','alguien','quien','qien','trade','cambio','kanbio','ofrezco','quiero','kiero','vendo','hago','tiene','tienes'];

  const tieneClave = claves.some(k => txt.includes(k));
  const tieneVerbo = verbos.some(v => txt.includes(v));

  // Caso 1: ritual/fusion + verbo = 100% spam de fusiones
  if(tieneClave && tieneVerbo) return true;
  // Caso 2: mensaje cortito tipo "ritual?", "alguien ritual", "fusion?"
  if((txt.includes('ritual') || txt.includes('fusion') || txt.includes('fucion')) && txt.length < 35) return true;
  // Caso 3: caballo + pegasus aunque sin verbo
  if(txt.includes('caballo') && txt.includes('pegas')) return true;
  return false;
}
function isMensajeChambeadoresEnGeneral(msg){
  if(!msg.guild) return false;
  const name = msg.channel.name.toLowerCase();
  if(name.includes('chambeador') || name.includes('reclutamiento') || name.includes('chambeadores-activos') || name.includes('chambeadores-logs')) return false;
  if(name.includes('fusiones') || name.includes('fusion-')) return false;
  let txt = msg.content.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const clavesChamba = ['busco chamba','buscan chamba','necesito chamba','quiero chamba','hay chamba','busco chambita','busco chambas','chambas','chambeador','chambeadores','chambiador','chambiadores','chambreador','chambeadore','chambeo','chambear','chambeando','trabajador','trabajadores','trabajo','busco trabajo','buscan trabajo','quiero trabajo','necesito trabajo','busco jale','busco curro','alguien busca chambeador','alguien busca chambeadores','alguien busca trabajador','alguien necesita chambeador','buscan chambeadores','busco chambeadores','necesito chambeador','me regala robux','me regalan robux','regala robux','regalan robux','alguien me regala','dona robux','donan robux','me donas robux','me donas','alguien dona','robux gratis','regalame robux','regalen robux','quiero ser chambeador','como ser chambeador','quiero chambear','como chambear','quiero ser trabajador','quiero ser chambiador','pagan robux','paga robux','pago robux','pagan por huevo','trabajo por robux','chamba por robux'];
  if(clavesChamba.some(k => txt.includes(k))) return true;
  if(txt.includes('chamba') && txt.length < 80) return true;
  if((txt.includes('trabajo') || txt.includes('trabajador')) && (txt.includes('busco') || txt.includes('quiero') || txt.includes('necesito') || txt.includes('alguien'))) return true;
  if(txt.includes('robux') && (txt.includes('regala') || txt.includes('dona') || txt.includes('gratis') || txt.includes('busco') || txt.includes('quiero') || txt.includes('me das'))) return true;
  return false;
}
function isPreguntaNotificaciones(msg){
  if(!msg.guild) return false;
  const name = msg.channel.name.toLowerCase();
  if(!name.includes('general')) return false;
  let txt = msg.content.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const claves = ['notificacion','notificaciones','noti','notis','no me llega','no me suena','no suena','no me avisa','no avisa','no me notifica','activar not','como activo','como prendo','como pongo','ping roles','ping-roles','notificaciones no'];
  return claves.some(k => txt.includes(k));
}
async function checkButterflyEvent(){
  try{
    const now = new Date();
    const m = now.getUTCMinutes();
    const h = now.getUTCHours();
    if(m!== 14 && m!== 44) return;
    const eventMinute = m === 14? 15 : 45;
    const key = `${h}:${eventMinute}`;
    if(lastButterflyPingKey === key) return;
    lastButterflyPingKey = key;
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if(!guild) return;
    await ensureButterflyRole(guild);
    const role = findRole(guild, BUTTERFLY_ROLE_NAME);
    const ch = findChannel(guild, CONFIG.channels.butterfly) || findChannel(guild, CONFIG.channels.apariciones) || findChannel(guild, CONFIG.channels.general);
    if(!ch) return;
    const embed = new EmbedBuilder().setColor(0x8A2BE2).setTitle(`${BUTTERFLY_EMOJI} ¡Floración de Mariposas en 1 minuto!`).setDescription(`**¡Prepara tu red!** ${BUTTERFLY_EMOJI}\n\nEl evento **THE BUTTERFLY BLOOM HAS BEGUN!** empieza en **1 minuto**\n\n📍 Ve al **Enchanted Forest**\n${BUTTERFLY_EMOJI} ¡Agarra tu red y atrapa mariposas!\n\n> Evento global cada 30 minutos`).setFooter({ text: `Papois Empire • ${BUTTERFLY_EMOJI} Floración de Mariposas` }).setTimestamp();
    await ch.send({ content: role? `${role} ${BUTTERFLY_EMOJI} **¡El evento de mariposas empieza en 1 minuto, prepárate!**` : `${BUTTERFLY_EMOJI} **¡Evento en 1 minuto!**`, embeds: [embed] }).catch(()=>{});
  }catch(e){ console.log('Butterfly error', e.message); }
}
function startButterflyScheduler(){
  console.log('🦋 Scheduler Mariposas GLOBAL iniciado :14 y :44 UTC = 1 min antes');
  setTimeout(checkButterflyEvent, 5000);
  setInterval(checkButterflyEvent, 30000);
}

function esRobloxUsernameValido(input){
  const raw = input.trim();
  if(raw.length < 3 || raw.length > 20) return { valid: false, reason: '❌ Tu user de Roblox debe tener entre 3 y 20 caracteres.' };
  if(raw.includes(' ')) return { valid: false, reason: '❌ No pongas espacios ni frases. Solo tu username, ej: `Nico123`' };
  if(!/^[a-zA-Z0-9_]+$/.test(raw)) return { valid: false, reason: '❌ Solo letras, números y _. Sin emojis, sin frases.' };
  const lower = raw.toLowerCase();
  const bloqueadas = ['necesito','nesecito','tengo','busco','quiero','vendo','cambio','divino','eterno','secreto','enchanted','royal','celestial','skeleton','pegasus','archangel','world','burner','los','las','yo'];
  if(bloqueadas.some(p => lower.includes(p)) && raw.length > 8) return { valid: false, reason: '❌ Escribe SOLO tu username de Roblox, no qué necesitas.' };
  return { valid: true, value: raw };
}

function esRobloxArrobaValido(input){
  let raw = input.trim();
  if(raw.startsWith('@')) raw = raw.slice(1);
  if(raw.length < 3 || raw.length > 20) return { valid: false, reason: '❌ Tu @ de Roblox debe tener entre 3 y 20 caracteres. Ej: `@Joss123`' };
  if(raw.includes(' ')) return { valid: false, reason: '❌ No pongas espacios. Solo tu @, ej: `@Joss123` - es el @, no el display name.' };
  if(!/^[a-zA-Z0-9_]+$/.test(raw)) return { valid: false, reason: '❌ Solo letras, números y _. Es el @, no el display name.' };
  const lower = raw.toLowerCase();
  const bloqueadas = ['necesito','nesecito','tengo','busco','quiero','vendo','cambio','divino','eterno','secreto','enchanted','royal','celestial','skeleton','pegasus','archangel','world','burner','los','las','yo','https','roblox.com'];
  if(bloqueadas.some(p => lower.includes(p)) && raw.length > 8) return { valid: false, reason: '❌ Escribe SOLO tu @ de Roblox, no frases. Ej: `@Joss123`' };
  return { valid: true, value: raw };
}

function getRangoChambeador(puntos){
  if(puntos >= 11) return CHAMBEADORES_ROLES.confianza;
  if(puntos >= 6) return CHAMBEADORES_ROLES.veterano;
  if(puntos >= 3) return CHAMBEADORES_ROLES.experimentado;
  return CHAMBEADORES_ROLES.novato;
}

async function actualizarRolChambeador(guild, member, puntos){
  try{
    const roles = Object.values(CHAMBEADORES_ROLES).filter(r=>r!==CHAMBEADORES_ROLES.baneado);
    for(const rn of roles){
      const ro = findRole(guild, rn);
      if(ro && member.roles.cache.has(ro.id)) await member.roles.remove(ro.id).catch(()=>{});
    }
    const nuevo = getRangoChambeador(puntos);
    const rolNuevo = findRole(guild, nuevo);
    if(rolNuevo) await member.roles.add(rolNuevo).catch(()=>{});
  }catch{}
}

function getGrupoFusion(fusionId){
  if(!fusionId) return 'angeles';
  if(fusionId.startsWith('angeles_')) return 'angeles';
  return 'enchanted';
}
function getNombreGrupo(grupo){
  return grupo === 'angeles' ? 'Angeles y Demonios' : 'Bosque Encantado';
}
function getGruposUsuario(userId){
  const grupos = new Set();
  for(const r of fusionesQueue){
    if(r.userId === userId) grupos.add(getGrupoFusion(r.fusionId));
  }
  for(const data of fusionesActivas.values()){
    if(data.users.includes(userId)) grupos.add(getGrupoFusion(data.fusionId));
  }
  return grupos;
}
function usuarioTieneFusionEnGrupo(userId, fusionId){
  return getGruposUsuario(userId).has(getGrupoFusion(fusionId));
}
function usuarioTieneFusion(userId){
  return getGruposUsuario(userId).size > 0;
}
function contarFusionesUsuario(userId){
  let c = 0;
  c += fusionesQueue.filter(r=>r.userId===userId).length;
  for(const data of fusionesActivas.values()){
    if(data.users.includes(userId)) c++;
  }
  return c;
}
function limpiarDuplicadosFusiones(){
  const vistos = new Map();
  const nuevaCola = [];
  const ordenada = [...fusionesQueue].sort((a,b)=> b.createdAt - a.createdAt);
  for(const r of ordenada){
    const key = `${r.userId}-${getGrupoFusion(r.fusionId)}`;
    if(!vistos.has(key)){
      vistos.set(key, true);
      nuevaCola.push(r);
    }
  }
  const eliminados = fusionesQueue.length - nuevaCola.length;
  fusionesQueue = nuevaCola.reverse();
  if(eliminados>0) saveFusiones();
  return eliminados;
}
function checkCompatibilidad(fusionId, haveA, haveB){
  const f = FUSIONES[fusionId];
  if(!f) return false;
  const norm = s => (s||'').trim().toLowerCase();
  const a = norm(haveA);
  const b = norm(haveB);

  // Enchanted: ambos OBLIGATORIO tener los 2
  if(f.id === 'enchanted'){
    return a === 'ambos' && b === 'ambos';
  }

  // Angeles: valida que el pet pertenezca a ESA fusión
  const valid = f.pets.map(p => norm(p));
  const isValid = h => h === 'ambos' || valid.includes(h);
  if(!isValid(a) ||!isValid(b)) return false;

  // Si uno tiene AMBOS, es compatible con cualquiera de esa misma fusión
  if(a === 'ambos' || b === 'ambos') return true;

  // Si no, tienen que ser diferentes de la misma fusión
  // ArchAngel!= World Burner = OK
  // Skeleton Horse!= Pegasus = OK
  // ArchAngel!= Skeleton Horse = NO (ya filtrado por isValid)
  return a!== b;
}
async function crearPanelFusiones(channel){
  try{
    const msgs = await channel.messages.fetch({ limit: 100 }).catch(()=>null);
    if(msgs){
      const old = msgs.filter(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('Centro de Fusiones'));
      for(const m of old.values()){ await m.delete().catch(e=>console.log(`del panel fail: ${e.message}`)); await new Promise(r=>setTimeout(r,250)); }
    }
  }catch(e){ console.log(`crearPanelFusiones fetch fail: ${e.message}`); }
  const embed = new EmbedBuilder().setColor(0x9B59B6).setTitle('🔀 Centro de Fusiones Papoi').setDescription(
    `**¿Qué fusión buscas hacer?**\n\n`+
    `😇 **Angeles y Demonios**\n`+
    `💀 Eterna: Skeleton Horse + Pegasus\n`+
    `😇 Divina: ArchAngel + World Burner\n\n`+
    `🌲 **Enchanted Forest**\n`+
    `Royal Skywhale + Celestial Sunlion\n`+
    `⚠ **OBLIGATORIO tener los 2 (Royal + Celestial) - NO se puede con 1 solo**\n\n`+
    `⚠️ **NOTA ANGELES Y DEMONIOS:**\n`+
    `> No importa el peso/tamaño del pet de tu pareja. Si TÚ metes un pet gigante, a TI te toca fusión gigante. Si tu pareja mete uno chico, a ÉL le toca chica. No busques pareja por peso, los creadores fueron listos.\n\n`+
    `**¿Tienes los 2?** Dale a **Tengo AMBOS** y te emparejamos con cualquiera.\n\n`+
    `👇 Elige bioma:`).setThumbnail(channel.guild.iconURL()).setFooter({ text: '1 búsqueda activa por persona • Auto-cierre 24h • Solo el bot escribe aquí' }).setTimestamp();
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fusion_bioma_angeles').setLabel('😇 Angeles y Demonios').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('fusion_bioma_enchanted').setLabel('🌲 Enchanted Forest').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('fusion_mis').setLabel('📋 Mis Búsquedas').setStyle(ButtonStyle.Secondary));
  await channel.send({ embeds: [embed], components: [row] });
}

async function crearPanelReclutamiento(channel){
  try{
    const msgs = await channel.messages.fetch({ limit: 30 }).catch(()=>null);
    if(msgs){
      const old = msgs.filter(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('CHAMBEADOR'));
      for(const m of old.values()){ await m.delete().catch(()=>{}); await new Promise(r=>setTimeout(r,250)); }
    }
  }catch{}
  const embed1 = new EmbedBuilder().setColor(0xF1C40F).setTitle('💼 CONVIÉRTETE EN CHAMBEADOR DEL PAPOI MAYOR').setDescription(
    `Busco huevos gigantes de esta lista. Si encuentras uno, me avisas y te pago en Robux.\n\n`+
    `**🥚 BUSCO SOLO ESTO:**\n**Divinos:** ${CHAMBEADORES_HUEVOS_INTERES.divinos.join(', ')}\n**Eternos:** ${CHAMBEADORES_HUEVOS_INTERES.eternos.join(', ')}\n\n`+
    `**📏 REFERENCIA:**\n${CHAMBEADORES_LINKS.tiktok1}\n${CHAMBEADORES_LINKS.tiktok2}\n\n`+
    `**💰 PAGO:** En Robux (monto lo ves cuando ya eres chambeador)\nSolo se paga a 1 persona y solo DESPUÉS de que me lo haya llevado.`
  ).setThumbnail(channel.guild.iconURL()).setFooter({ text: 'Papois Empire • Chambeadores' }).setTimestamp();
  const embed2 = new EmbedBuilder().setColor(0x2ECC71).setTitle('✅ OBLIGATORIO PARA PAGARTE Y UNIRME').setDescription(
    `**1. Sígueme en Roblox:**\n${CHAMBEADORES_LINKS.robloxProfile}\n\n`+
    `**2. Únete a mi comunidad (OBLIGATORIO PARA PAGARTE):**\n${CHAMBEADORES_LINKS.comunidad}\nSi no estás dentro, no puedo pagarte por Payouts.\n\n`+
    `**3. Activa en Roblox > Privacidad > Visibilidad:**\nMostrar juego actual -> Amigos y personas que sigo\nEstado de conexión -> Amigos y personas que sigo\nCompartir actualizaciones -> PRENDIDO\n\n> Si lo dejas en "Nadie" no puedo unirme.`
  );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chambeador_registrar').setLabel('📝 Registrar mi @ de Roblox').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('chambeador_corregir').setLabel('✏️ Corregir mi @').setStyle(ButtonStyle.Secondary)
  );
  await channel.send({ embeds: [embed1, embed2], components: [row] });
}

async function crearPanelActivos(channel){
  try{
    const msgs = await channel.messages.fetch({ limit: 20 }).catch(()=>null);
    if(msgs){
      const old = msgs.filter(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('ZONA DE CHAMBA'));
      for(const m of old.values()){ await m.delete().catch(()=>{}); await new Promise(r=>setTimeout(r,250)); }
    }
  }catch{}
  const embed = new EmbedBuilder().setColor(0xF1C40F).setTitle('🥚 ZONA DE CHAMBA ACTIVA').setDescription(
    `**💎 PAGO CONFIRMADO:**\nEterno gigante = **${CHAMBEADORES_PAGO.eterno} Robux**\nDivino gigante = **${CHAMBEADORES_PAGO.divino} Robux**\n\n`+
    `Debes estar dentro de mi comunidad:\n${CHAMBEADORES_LINKS.comunidad}\n\n`+
    `Cuando veas uno de la lista, pícale abajo y quédate sin salirte.\nCooldown: 1 minuto.`
  ).setThumbnail(channel.guild.iconURL()).setFooter({ text: 'Pago solo después de llevármelo' }).setTimestamp();
  const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('chambeador_reporte').setLabel('🥚 ¡ENCONTRÉ HUEVO GIGANTE!').setStyle(ButtonStyle.Success));
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('chambeador_renunciar').setLabel('🚪 Renunciar a ser Chambeador').setStyle(ButtonStyle.Danger));
  await channel.send({ embeds: [embed], components: [row1, row2] });
}

async function postReporteChambeador(guild, userId){
  const data = chambeadoresData[userId];
  if(!data) return;
  const logs = findChannel(guild, CONFIG.channels.chambeadoresLogs);
  if(!logs) return;
  const puntos = data.puntos||0;
  const rango = getRangoChambeador(puntos);
  const embed = new EmbedBuilder().setColor(0xED4245).setTitle('🚨 ¡CHAMBA ENCONTRADA!').setDescription(
    `<@${process.env.OWNER_ID}> 🚨 **¡CHAMBA!**\n\n**De:** <@${userId}> | Roblox: **${data.robloxUser}**\n**Rango oculto:** ${rango} (${puntos} pts)\n**Hora:** <t:${Math.floor(Date.now()/1000)}:T>\n\n> Copia: \`${data.robloxUser}\``
  ).setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`chambeador_confirm_${userId}_eterno`).setLabel(`✅ Cierto Eterno ${CHAMBEADORES_PAGO.eterno}R$`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`chambeador_confirm_${userId}_divino`).setLabel(`✅ Cierto Divino ${CHAMBEADORES_PAGO.divino}R$`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`chambeador_ban_${userId}`).setLabel('❌ Mentira - Banear').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`chambeador_copy_${userId}`).setLabel('📋 Copiar @').setStyle(ButtonStyle.Secondary)
  );
  await logs.send({ content: `<@${process.env.OWNER_ID}> 🚨`, embeds: [embed], components: [row] }).catch(()=>{});
}

async function postBusquedaFusion(guild, req){
  const canal = findChannel(guild, CONFIG.channels.fusiones); if(!canal) return null;
  const fusion = FUSIONES[req.fusionId];
  const tieneTxt = req.have==='AMBOS'? `AMBOS (${fusion.pets.join(' + ')})` : req.have;
  // V6.2: Mostramos Discord SI, ocultamos Roblox hasta el privado
  const embed = new EmbedBuilder()
   .setColor(0x9B59B6)
   .setTitle(`${fusion.emoji} BUSCANDO - ${fusion.bioma} ${fusion.label}`)
   .setDescription(`👤 <@${req.userId}> | Tiene: **${tieneTxt}**\n⏳ En espera de pareja compatible...\n\n> 🔒 Tu user de Roblox solo se mostrará cuando se abra el canal privado.`)
   .setFooter({ text: `Fusión: ${fusion.label} • Activa 24h` })
   .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fusion_join_${req.userId}`).setLabel('🙋 Yo tengo lo que busca!').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`fusion_cancel_${req.userId}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
  );
  const msg = await canal.send({ embeds: [embed], components: [row] }).catch(()=>null);
  if(msg){
    req.messageId=msg.id;
    req.channelId=canal.id;
    await saveFusiones();
    if(useMongo && FusionModel) await FusionModel.create(req).catch(()=>{});
  }
  return msg;
}
async function crearCanalFusionPrivado(guild, req1, req2){
  let categoria = findCategory(guild, CONFIG.categories.fusionesActivas);
  if(!categoria) categoria = await guild.channels.create({ name: '🔀 Fusiones Activas', type: ChannelType.GuildCategory }).catch(()=>null);
  const modRole = findRole(guild, 'moderador'); const mayorRole = findRole(guild, 'papoi mayor');
  const overwrites = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: req1.userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }, { id: req2.userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }, { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] }];
  if(modRole) overwrites.push({ id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
  if(mayorRole) overwrites.push({ id: mayorRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels] });
  const canal = await guild.channels.create({ name: `🔀│fusion-${Math.floor(Math.random()*9000)+1000}`, type: ChannelType.GuildText, parent: categoria?.id, permissionOverwrites: overwrites, topic: `Fusión ${req1.fusionId}` }).catch(()=>null);
  if(!canal) return null;
  const fusion = FUSIONES[req1.fusionId];
  const notaPeso = fusion.bioma === 'Angeles y Demonios'? `\n\n⚠️ **IMPORTANTE:** El peso NO se cruza. Si tú metes gigante, te toca gigante a ti, aunque tu pareja meta chico. No discutan por peso.` : '';
  const embed = new EmbedBuilder().setColor(0x57F287).setTitle(`✅ ¡PAREJA ENCONTRADA! ${fusion.emoji} ${fusion.label}`).setDescription(`**Fusión:** ${fusion.bioma} - ${fusion.label} (${fusion.pets.join(' + ')})\n\n**Jugador 1:** <@${req1.userId}> - Tiene: **${req1.have}**\n🎮 Roblox: **${req1.robloxUser}**\n\n**Jugador 2:** <@${req2.userId}> - Tiene: **${req2.have}**\n🎮 Roblox: **${req2.robloxUser}**${notaPeso}\n\n**Instrucciones:**\n1. Agréguense en Roblox\n2. Entren al juego\n3. Hagan la fusión\n\nConfirmen cuando terminen.`).setTimestamp();
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fusion_confirm_yes_${canal.id}`).setLabel('✅ Ya fusionamos').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`fusion_confirm_no_${canal.id}`).setLabel('❌ Ya no quiero').setStyle(ButtonStyle.Danger));
  const rowMod = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fusion_mod_success_${canal.id}`).setLabel('✅ Mod: Exitosa').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`fusion_mod_fail_${canal.id}`).setLabel('❌ Mod: Fallida').setStyle(ButtonStyle.Secondary));
  await canal.send({ content: `<@${req1.userId}> <@${req2.userId}>`, embeds: [embed], components: [row, rowMod] }).catch(()=>{});
    fusionesActivas.set(canal.id, { channelId: canal.id, users: [req1.userId, req2.userId], fusionId: req1.fusionId, reqs: [req1, req2], createdAt: Date.now(), lastPing: Date.now(), confirms: [] });
      await saveFusionesActivas();
  if(useMongo && FusionModel){
    await FusionModel.deleteOne({ userId: req1.userId, fusionId: req1.fusionId }).catch(()=>{});
    await FusionModel.deleteOne({ userId: req2.userId, fusionId: req2.fusionId }).catch(()=>{});
  }
  fusionesQueue = fusionesQueue.filter(r=>r.userId!==req1.userId || getGrupoFusion(r.fusionId)!==getGrupoFusion(req1.fusionId));
  fusionesQueue = fusionesQueue.filter(r=>r.userId!==req2.userId || getGrupoFusion(r.fusionId)!==getGrupoFusion(req2.fusionId));
  const canalFusiones = findChannel(guild, CONFIG.channels.fusiones);
  if(canalFusiones){ if(req1.messageId) canalFusiones.messages.delete(req1.messageId).catch(()=>{}); if(req2.messageId) canalFusiones.messages.delete(req2.messageId).catch(()=>{}); }
  await saveFusiones(); return canal;
}
function startFusionesScheduler(){
  console.log('🔀 Scheduler Fusiones V6.6 FIX DEFINITIVO iniciado - caza fantasmas cada 30s');
  setTimeout(async ()=>{
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if(guild){ const elim = limpiarDuplicadosFusiones(); if(elim>0) console.log(`🧹 ${elim} duplicados al iniciar`); }
  }, 8000);
  setInterval(async ()=>{
    try{
      const guild = client.guilds.cache.get(process.env.GUILD_ID); if(!guild) return;
      const canalFusiones = findChannel(guild, CONFIG.channels.fusiones);
      const toDeleteUser = new Set();
      for(const req of [...fusionesQueue]){
        try{
          const member = guild.members.cache.get(req.userId) || await guild.members.fetch(req.userId).catch(()=>null);
          if(!member) toDeleteUser.add(req.userId);
        }catch{ toDeleteUser.add(req.userId); }
      }
      for(const userId of toDeleteUser){
        const borradas = fusionesQueue.filter(r => r.userId === userId);
        for(const r of borradas){
          if(canalFusiones && r.messageId) canalFusiones.messages.delete(r.messageId).catch(()=>{});
          if(useMongo && FusionModel) await FusionModel.deleteOne({ userId: r.userId, fusionId: r.fusionId }).catch(()=>{});
        }
        if(borradas.length){ fusionesQueue = fusionesQueue.filter(r => r.userId!== userId); console.log(`🧹 Auto-borrado 30s ${userId} (${borradas.length})`); }
      }
      if(toDeleteUser.size>0) await saveFusiones();
      limpiarDuplicadosFusiones();

      for(const [chanId, data] of [...fusionesActivas.entries()]){
        const canal = guild.channels.cache.get(chanId);
        if(!canal){
          console.log(`🧹 Activa huérfana ${chanId} sin canal -> borrando`);
          fusionesActivas.delete(chanId);
          await saveFusionesActivas();
          continue;
        }
        for(const uid of data.users){
          const mem = guild.members.cache.get(uid) || await guild.members.fetch(uid).catch(()=>null);
          if(!mem){
            const otherId = data.users.find(id=>id!==uid);
            const otherReq = data.reqs.find(r=>r.userId===otherId);
            if(otherReq){ fusionesQueue.push({...otherReq, createdAt: Date.now(), messageId: null }); await postBusquedaFusion(guild, fusionesQueue[fusionesQueue.length-1]); }
            setTimeout(async ()=>{
              await canal.delete().catch(()=>{});
              fusionesActivas.delete(chanId);
              await saveFusionesActivas();
              await saveFusiones();
            }, 3000);
            console.log(`🧹 Usuario ${uid} se salió, borrando canal ${chanId}`);
            break;
          }
        }
      }

      const now=Date.now();
      const toRemove=fusionesQueue.filter(r=>now-r.createdAt> 2*60*60*1000);
      for(const r of toRemove){ if(canalFusiones&&r.messageId) canalFusiones.messages.delete(r.messageId).catch(()=>{}); if(useMongo && FusionModel) await FusionModel.deleteOne({ userId: r.userId, fusionId: r.fusionId }).catch(()=>{}); }
      if(toRemove.length){ fusionesQueue=fusionesQueue.filter(r=>now-r.createdAt<=2*60*60*1000); await saveFusiones(); console.log(`🧹 Limpieza 2h: ${toRemove.length} búsquedas viejas`); }
    }catch(e){ console.log('Fusiones scheduler V6.6', e.message); }
  }, 30*1000);
}

async function handleFusionesInteraction(inter){
  const guild=inter.guild;
  try{
    if(inter.isStringSelectMenu() && inter.customId==='select_fusion_tipo'){
      const fusionId=inter.values[0]; const fusion=FUSIONES[fusionId];
            const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fusion_have_${fusionId}_${fusion.pets[0].replace(/\s+/g,'_')}`).setLabel(`Tengo ${fusion.pets[0]}`).setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`fusion_have_${fusionId}_${fusion.pets[1].replace(/\s+/g,'_')}`).setLabel(`Tengo ${fusion.pets[1]}`).setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`fusion_have_${fusionId}_AMBOS`).setLabel(`Tengo AMBOS`).setStyle(ButtonStyle.Success));
      return inter.reply({ content: `${fusion.emoji} **${fusion.bioma} - ${fusion.label}**\n¿Que tienes?`, components: [row], flags: MessageFlags.Ephemeral });
    }
    if(inter.isButton()){
      if(inter.customId==='fusion_bioma_angeles'){
        const row=new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_fusion_tipo').setPlaceholder('Elige fusión').addOptions({ label: 'Eterna - Skeleton + Pegasus', value: 'angeles_eterna', emoji: '💀' }, { label: 'Divina - ArchAngel + World Burner', value: 'angeles_divina', emoji: '😇' }));
        return inter.reply({ content: '😇 **Angeles y Demonios**', components: [row], flags: MessageFlags.Ephemeral });
      }
      if(inter.customId==='fusion_bioma_enchanted'){
        const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fusion_have_enchanted_AMBOS`).setLabel(`Tengo Royal + Celestial (AMBOS - OBLIGATORIO)`).setStyle(ButtonStyle.Success));
        return inter.reply({ content: `🌲 **Enchanted Forest**\n⚠ **OBLIGATORIO tener AMBOS**\nNecesitas: Royal Skywhale + Celestial Sunlion\n\n> No puedes entrar si solo tienes 1, necesitas los 2.`, components: [row], flags: MessageFlags.Ephemeral });
      }
      if(inter.customId==='fusion_mis'){
        const mine=fusionesQueue.filter(r=>r.userId===inter.user.id); if(!mine.length) return inter.reply({ content: '📭 Sin búsquedas.', flags: MessageFlags.Ephemeral });
        const txt=mine.map(r=>`• ${FUSIONES[r.fusionId].label} - Tienes ${r.have} - Roblox ${r.robloxUser}`).join('\n'); return inter.reply({ content: txt, flags: MessageFlags.Ephemeral });
      }
            if(inter.customId.startsWith('fusion_have_')){
        let fusionId, havePet; if(inter.customId.includes('angeles_eterna')){ fusionId='angeles_eterna'; havePet=inter.customId.replace(`fusion_have_${fusionId}_`,''); } else if(inter.customId.includes('angeles_divina')){ fusionId='angeles_divina'; havePet=inter.customId.replace(`fusion_have_${fusionId}_`,''); } else { fusionId='enchanted'; havePet='AMBOS'; } havePet=havePet.replace(/_/g,' ');
        if(usuarioTieneFusionEnGrupo(inter.user.id, fusionId)){
          return inter.reply({ content: `❌ Ya tienes una búsqueda de **${getNombreGrupo(getGrupoFusion(fusionId))}** activa. Cancélala primero.\nPuedes tener 1 de Angeles y 1 de Bosque, pero no 2 de la misma.`, flags: MessageFlags.Ephemeral });
        }
        if(contarFusionesUsuario(inter.user.id) >= 2){
          return inter.reply({ content: `❌ Ya tienes 2 fusiones activas (máx 1 por bioma). Cancela una primero.`, flags: MessageFlags.Ephemeral });
        }
                const modal=new ModalBuilder().setCustomId(`modal_fusion_${fusionId}_${havePet.replace(/\s+/g,'_')}`).setTitle(`Fusión ${FUSIONES[fusionId].label}`);
const input=new TextInputBuilder().setCustomId('robloxUser').setLabel('Tu user de Roblox').setPlaceholder('Ej: Nico123 - SOLO username').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(20); modal.addComponents(new ActionRowBuilder().addComponents(input)); return inter.showModal(modal);
      }
            if(inter.customId.startsWith('fusion_join_') &&!inter.customId.includes('_have_')){
        const ownerId=inter.customId.replace('fusion_join_',''); const req=fusionesQueue.find(r=>r.userId===ownerId); if(!req) return inter.reply({ content: '❌ Ya no existe.', flags: MessageFlags.Ephemeral }); if(req.userId===inter.user.id) return inter.reply({ content: '❌ No puedes contigo mismo.', flags: MessageFlags.Ephemeral });
        if(usuarioTieneFusionEnGrupo(inter.user.id, req.fusionId)){
          return inter.reply({ content: `❌ Ya tienes una de **${getNombreGrupo(getGrupoFusion(req.fusionId))}**. Cancela esa primero.`, flags: MessageFlags.Ephemeral });
        }
        if(contarFusionesUsuario(inter.user.id) >= 2){
          return inter.reply({ content: `❌ Ya tienes 2 fusiones activas.`, flags: MessageFlags.Ephemeral });
        }
                const fusion=FUSIONES[req.fusionId];
                if(fusion.requiresBoth){
                  const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fusion_join_have_${ownerId}_AMBOS`).setLabel(`Tengo AMBOS (Royal + Celestial) - OBLIGATORIO`).setStyle(ButtonStyle.Success));
                  return inter.reply({ content: `🌲 **Enchanted Forest es OBLIGATORIO tener AMBOS**\nVas con <@${ownerId}> que tiene ${req.have}\n> Necesitas Royal Skywhale + Celestial Sunlion`, components: [row], flags: MessageFlags.Ephemeral });
                }
                const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fusion_join_have_${ownerId}_${fusion.pets[0].replace(/\s+/g,'_')}`).setLabel(`Tengo ${fusion.pets[0]}`).setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`fusion_join_have_${ownerId}_${fusion.pets[1].replace(/\s+/g,'_')}`).setLabel(`Tengo ${fusion.pets[1]}`).setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`fusion_join_have_${ownerId}_AMBOS`).setLabel(`Tengo AMBOS`).setStyle(ButtonStyle.Success));
        return inter.reply({ content: `Vas con <@${ownerId}> que tiene ${req.have}`, components: [row], flags: MessageFlags.Ephemeral });
      }
      if(inter.customId.startsWith('fusion_join_have_')){
        const rest=inter.customId.replace('fusion_join_have_',''); const ownerId=rest.split('_')[0]; const havePet=rest.replace(`${ownerId}_`,'').replace(/_/g,' ');
                const modal=new ModalBuilder().setCustomId(`modal_fusion_join_${ownerId}_${havePet.replace(/\s+/g,'_')}`).setTitle('Roblox User');
const input=new TextInputBuilder().setCustomId('robloxUser').setLabel('Tu user de Roblox').setPlaceholder('Ej: Nico123 - SOLO username').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(20); modal.addComponents(new ActionRowBuilder().addComponents(input)); return inter.showModal(modal);
      }
            if(inter.customId.startsWith('fusion_cancel_')){
        const ownerId=inter.customId.replace('fusion_cancel_',''); if(inter.user.id!==ownerId &&!isMod(inter.member)) return inter.reply({ content: '❌ No puedes.', flags: MessageFlags.Ephemeral });
        const req=fusionesQueue.find(r=>r.userId===ownerId); 
        if(!req){ fusionesQueue=fusionesQueue.filter(r=>r.userId!==ownerId); await saveFusiones(); return inter.reply({ content: '✅ Cancelada.', flags: MessageFlags.Ephemeral }); }
        const grupo = getGrupoFusion(req.fusionId);
        const borradas = fusionesQueue.filter(r=>r.userId===ownerId && getGrupoFusion(r.fusionId)===grupo);
        for(const r of borradas){ 
          if(r.messageId){ const ch=findChannel(guild, CONFIG.channels.fusiones); if(ch) ch.messages.delete(r.messageId).catch(()=>{}); }
          if(useMongo && FusionModel) await FusionModel.deleteOne({ userId: r.userId, fusionId: r.fusionId }).catch(()=>{});
        }
        fusionesQueue=fusionesQueue.filter(r=>!(r.userId===ownerId && getGrupoFusion(r.fusionId)===grupo));
        await saveFusiones(); return inter.reply({ content: `✅ Cancelada ${getNombreGrupo(grupo)}.`, flags: MessageFlags.Ephemeral });
      }
      if(inter.customId.startsWith('fusion_confirm_yes_') || inter.customId.startsWith('fusion_confirm_no_') || inter.customId.startsWith('fusion_mod_success_') || inter.customId.startsWith('fusion_mod_fail_')){
        let data=fusionesActivas.get(inter.channelId);
        if(!data){
          // FIX V6.7.1: si el bot se reinició, permite cerrar si es MOD o el canal es de fusión
          if(isMod(inter.member) || inter.channel.name.includes('fusion-')){
            await inter.reply({ content: '⚠ Datos perdidos por reinicio. Borrando canal como MOD...', flags: MessageFlags.Ephemeral }).catch(()=>{});
            setTimeout(async ()=>{
              await inter.channel.delete().catch(()=>{});
              fusionesActivas.delete(inter.channelId);
              await saveFusionesActivas();
            }, 2000);
            return;
          }
          return inter.reply({ content: '❌ No data. Bot reiniciado, pide a un mod que use Mod: Exitosa.', flags: MessageFlags.Ephemeral });
        }
        if(inter.customId.startsWith('fusion_confirm_yes_') || inter.customId.startsWith('fusion_mod_success_')){
          if(!data.confirms.includes(inter.user.id)) data.confirms.push(inter.user.id);
          await saveFusionesActivas();
          const isModClose=inter.customId.startsWith('fusion_mod_success_');
          if(data.confirms.length>=2 || isModClose || isMod(inter.member)){
            const log=findChannel(guild, CONFIG.channels.fusionesLogs) || findChannel(guild, CONFIG.channels.staffSanciones); if(log) log.send({ content: `✅ Fusión EXITOSA ${FUSIONES[data.fusionId].label} - <@${data.users[0]}> + <@${data.users[1]}>` }).catch(()=>{});
            await inter.reply({ content: '✅ Exitosa! Cerrando en 10s...' });
            setTimeout(async ()=>{
              await inter.channel.delete().catch(()=>{});
              fusionesActivas.delete(inter.channelId);
              await saveFusionesActivas();
            }, 10000);
            return;
          } else { return inter.reply({ content: `✅ Confirmaste, falta el otro.`, flags: MessageFlags.Ephemeral }); }
        } else {
          const otherId=data.users.find(id=>id!==inter.user.id);
          const otherReq=data.reqs.find(r=>r.userId===otherId);
          if(otherReq){ fusionesQueue.push({...otherReq, createdAt: Date.now(), messageId: null }); await postBusquedaFusion(guild, fusionesQueue[fusionesQueue.length-1]); }
          await inter.reply({ content: `❌ Cancelada, <@${otherId}> vuelve a búsqueda.` });
          setTimeout(async ()=>{
            await inter.channel.delete().catch(()=>{});
            fusionesActivas.delete(inter.channelId);
            await saveFusionesActivas();
            await saveFusiones();
          }, 5000);
          return;
        }
      }
    }
        if(inter.isModalSubmit() && inter.customId.startsWith('modal_fusion_')){
      if(inter.customId.startsWith('modal_fusion_join_')){
        const rest=inter.customId.replace('modal_fusion_join_',''); const ownerId=rest.split('_')[0]; const havePet=rest.replace(`${ownerId}_`,'').replace(/_/g,' ');
        const robloxUser=inter.fields.getTextInputValue('robloxUser').trim();
        const check = esRobloxUsernameValido(robloxUser);
        if(!check.valid){
          return inter.reply({ content: check.reason + '\n\n> Ej válido: `Nico123`', flags: MessageFlags.Ephemeral });
        }
                const ownerReq=fusionesQueue.find(r=>r.userId===ownerId); if(!ownerReq) return inter.reply({ content: '❌ Ya no existe.', flags: MessageFlags.Ephemeral });
        if(!checkCompatibilidad(ownerReq.fusionId, ownerReq.have, havePet)) return inter.reply({ content: `❌ No compatible.`, flags: MessageFlags.Ephemeral });
        if(usuarioTieneFusionEnGrupo(inter.user.id, ownerReq.fusionId)){
          return inter.reply({ content: `❌ Ya tienes una de **${getNombreGrupo(getGrupoFusion(ownerReq.fusionId))}** activa.`, flags: MessageFlags.Ephemeral });
        }
        if(contarFusionesUsuario(inter.user.id) >= 2){
          return inter.reply({ content: `❌ Ya tienes 2 fusiones activas.`, flags: MessageFlags.Ephemeral });
        }
        const myReq={ userId: inter.user.id, fusionId: ownerReq.fusionId, have: havePet, robloxUser: check.value, createdAt: Date.now(), messageId: null };
        await inter.reply({ content: '✅ Match! Creando canal...', flags: MessageFlags.Ephemeral }); await crearCanalFusionPrivado(guild, ownerReq, myReq); return;
      } else {
        let fusionId, havePet; const rest=inter.customId.replace('modal_fusion_',''); if(rest.startsWith('angeles_eterna_')){ fusionId='angeles_eterna'; havePet=rest.replace('angeles_eterna_','').replace(/_/g,' '); } else if(rest.startsWith('angeles_divina_')){ fusionId='angeles_divina'; havePet=rest.replace('angeles_divina_','').replace(/_/g,' '); } else { fusionId='enchanted'; havePet='AMBOS'; }
        const robloxUser=inter.fields.getTextInputValue('robloxUser').trim();
        const check = esRobloxUsernameValido(robloxUser);
        if(!check.valid){
          return inter.reply({ content: check.reason, flags: MessageFlags.Ephemeral });
        }
                const compatibleReq=fusionesQueue.find(r=>r.fusionId===fusionId && r.userId!==inter.user.id && checkCompatibilidad(fusionId, r.have, havePet));
        if(compatibleReq){ 
          const myReq={ userId: inter.user.id, fusionId, have: havePet, robloxUser: check.value, createdAt: Date.now() }; 
          await inter.reply({ content: '✅ Pareja instantánea! Creando canal...', flags: MessageFlags.Ephemeral }); 
          await crearCanalFusionPrivado(guild, compatibleReq, myReq); 
        }
        else {
          if(usuarioTieneFusionEnGrupo(inter.user.id, fusionId)){ return inter.reply({ content: `❌ Ya tienes una de **${getNombreGrupo(getGrupoFusion(fusionId))}**`, flags: MessageFlags.Ephemeral }); }
          if(contarFusionesUsuario(inter.user.id) >= 2){ return inter.reply({ content: `❌ Ya tienes 2 fusiones activas.`, flags: MessageFlags.Ephemeral }); }
          const newReq={ userId: inter.user.id, fusionId, have: havePet, robloxUser: check.value, createdAt: Date.now(), messageId: null }; fusionesQueue.push(newReq); await saveFusiones(); await postBusquedaFusion(guild, newReq); return inter.reply({ content: `✅ Publicado en #fusiones - ${FUSIONES[fusionId].label} teniendo ${havePet}`, flags: MessageFlags.Ephemeral }); }
      }
    }
  }catch(e){ console.log('Fusiones error', e); if(!inter.replied) inter.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral }).catch(()=>{}); }
}

async function handleChambeadoresInteraction(inter){
  const guild = inter.guild;
  try{
    if(inter.isButton()){
      if(inter.customId === 'chambeador_registrar'){
        if(chambeadoresData[inter.user.id]?.baneado) return inter.reply({ content: '🚫 Estás baneado.', flags: MessageFlags.Ephemeral });
        if(chambeadoresData[inter.user.id]) return inter.reply({ content: `Ya estás como \`${chambeadoresData[inter.user.id].robloxUser}\`. Usa Corregir.`, flags: MessageFlags.Ephemeral });
        const modal = new ModalBuilder().setCustomId('modal_chambeador_registrar').setTitle('Registrar @ de Roblox');
        const input = new TextInputBuilder().setCustomId('robloxUser').setLabel('Tu @ de Roblox (con o sin @)').setPlaceholder('Ej: @Joss123').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(22);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return inter.showModal(modal);
      }
      if(inter.customId === 'chambeador_corregir'){
        if(!chambeadoresData[inter.user.id]) return inter.reply({ content: '❌ No estás registrado.', flags: MessageFlags.Ephemeral });
        if(chambeadoresData[inter.user.id]?.baneado) return inter.reply({ content: '🚫 Baneado.', flags: MessageFlags.Ephemeral });
        const modal = new ModalBuilder().setCustomId('modal_chambeador_corregir').setTitle('Corregir @ de Roblox');
        const input = new TextInputBuilder().setCustomId('robloxUser').setLabel('Nuevo @').setPlaceholder('Ej: @Joss123').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(22);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return inter.showModal(modal);
      }
      if(inter.customId === 'chambeador_reporte'){
        const data = chambeadoresData[inter.user.id];
        if(!data || data.baneado) return inter.reply({ content: '❌ No eres chambeador. Ve a #💼│reclutamiento-chambeadores', flags: MessageFlags.Ephemeral });
        const cd = checkCooldown(inter.user.id, 'chambeador_reporte', 60);
        if(cd>0) return inter.reply({ content: `⏳ Espera ${cd}s.`, flags: MessageFlags.Ephemeral });
        await postReporteChambeador(guild, inter.user.id);
        chambeadoresData[inter.user.id].lastReport = Date.now();
        await saveChambeadores(inter.user.id);
        return inter.reply({ content: `✅ Reporte enviado al dueño! Quédate en tu server. \`${data.robloxUser}\``, flags: MessageFlags.Ephemeral });
      }
      if(inter.customId === 'chambeador_renunciar'){
        if(!chambeadoresData[inter.user.id]) return inter.reply({ content: '❌ No eres chambeador.', flags: MessageFlags.Ephemeral });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('chambeador_renunciar_confirm').setLabel('Sí, renunciar').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('chambeador_renunciar_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
        );
        return inter.reply({ content: '⚠ ¿Seguro? Perderás rol y XP se reinicia a 0.', components: [row], flags: MessageFlags.Ephemeral });
      }
      if(inter.customId === 'chambeador_renunciar_confirm'){
        const data = chambeadoresData[inter.user.id];
        if(!data) return inter.reply({ content: '❌ No eres chambeador.', flags: MessageFlags.Ephemeral });
        const member = guild.members.cache.get(inter.user.id) || await guild.members.fetch(inter.user.id).catch(()=>null);
        if(member){
          for(const rn of Object.values(CHAMBEADORES_ROLES)){
            if(rn===CHAMBEADORES_ROLES.baneado) continue;
            const ro = findRole(guild, rn);
            if(ro && member.roles.cache.has(ro.id)) await member.roles.remove(ro.id).catch(()=>{});
          }
        }
        delete chambeadoresData[inter.user.id];
        if(ChambeadorModel) await ChambeadorModel.deleteOne({ userId: inter.user.id }).catch(()=>{});
        await saveChambeadores();
        return inter.update({ content: '✅ Renunciaste. Progreso borrado a 0. Ya no ves #🥚│chambeadores-activos.', components: [] });
      }
      if(inter.customId === 'chambeador_renunciar_cancel'){
        return inter.update({ content: '❌ Cancelado.', components: [] });
      }
      if(inter.customId.startsWith('chambeador_confirm_')){
        if(!isOwner(inter.user.id)) return inter.reply({ content: '❌ Solo dueño.', flags: MessageFlags.Ephemeral });
        const userId = inter.customId.split('_')[2];
        const tipo = inter.customId.split('_')[3];
        const data = chambeadoresData[userId];
        if(!data) return inter.reply({ content: '❌ No encontrado.', flags: MessageFlags.Ephemeral });
        data.puntos = (data.puntos||0)+1;
        await saveChambeadores(userId);
        const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(()=>null);
        if(member) await actualizarRolChambeador(guild, member, data.puntos);
        const pago = tipo==='divino'? CHAMBEADORES_PAGO.divino : CHAMBEADORES_PAGO.eterno;
        await inter.reply({ content: `✅ Confirmado ${tipo.toUpperCase()} - ${pago} R$. <@${userId}> ahora ${data.puntos} pts -> ${getRangoChambeador(data.puntos)}. Págale en ${CHAMBEADORES_LINKS.comunidad}` });
        return;
      }
      if(inter.customId.startsWith('chambeador_ban_')){
        if(!isOwner(inter.user.id)) return inter.reply({ content: '❌ Solo dueño.', flags: MessageFlags.Ephemeral });
        const userId = inter.customId.replace('chambeador_ban_','');
        const data = chambeadoresData[userId] || { robloxUser: 'desconocido', puntos: 0 };
        chambeadoresData[userId] = {...data, baneado: true, puntos: 0 };
        await saveChambeadores(userId);
        const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(()=>null);
        if(member){
          for(const rn of Object.values(CHAMBEADORES_ROLES)){
            if(rn===CHAMBEADORES_ROLES.baneado) continue;
            const ro = findRole(guild, rn);
            if(ro && member.roles.cache.has(ro.id)) await member.roles.remove(ro.id).catch(()=>{});
          }
          const banRole = findRole(guild, CHAMBEADORES_ROLES.baneado);
          if(banRole) await member.roles.add(banRole).catch(()=>{});
        }
        const recluta = findChannel(guild, CONFIG.channels.chambeadoresRecluta);
        const activos = findChannel(guild, CONFIG.channels.chambeadoresActivos);
        const bRole = findRole(guild, CHAMBEADORES_ROLES.baneado);
        if(recluta && bRole) await recluta.permissionOverwrites.edit(bRole.id, { ViewChannel: false }).catch(()=>{});
        if(activos && bRole) await activos.permissionOverwrites.edit(bRole.id, { ViewChannel: false }).catch(()=>{});
        await inter.reply({ content: `🚫 <@${userId}> baneado. No ve canales chambeadores.` });
        return;
      }
      if(inter.customId.startsWith('chambeador_copy_')){
        const userId = inter.customId.replace('chambeador_copy_','');
        const data = chambeadoresData[userId];
        if(!data) return inter.reply({ content: '❌ No data', flags: MessageFlags.Ephemeral });
        return inter.reply({ content: `\`${data.robloxUser}\``, flags: MessageFlags.Ephemeral });
      }
    }
    if(inter.isModalSubmit()){
      if(inter.customId === 'modal_chambeador_registrar' || inter.customId === 'modal_chambeador_corregir'){
        const input = inter.fields.getTextInputValue('robloxUser').trim();
        const check = esRobloxArrobaValido(input);
        if(!check.valid) return inter.reply({ content: check.reason, flags: MessageFlags.Ephemeral });
        if(chambeadoresData[inter.user.id]?.baneado) return inter.reply({ content: '🚫 Baneado.', flags: MessageFlags.Ephemeral });
        const isNew =!chambeadoresData[inter.user.id];
        chambeadoresData[inter.user.id] = {
          robloxUser: check.value,
          puntos: chambeadoresData[inter.user.id]?.puntos||0,
          baneado: false,
          lastReport: chambeadoresData[inter.user.id]?.lastReport||0,
          createdAt: chambeadoresData[inter.user.id]?.createdAt||Date.now()
        };
        await saveChambeadores(inter.user.id);
        const member = guild.members.cache.get(inter.user.id) || await guild.members.fetch(inter.user.id).catch(()=>null);
        if(member){
          const banRole = findRole(guild, CHAMBEADORES_ROLES.baneado);
          if(banRole && member.roles.cache.has(banRole.id)) await member.roles.remove(banRole.id).catch(()=>{});
          await actualizarRolChambeador(guild, member, chambeadoresData[inter.user.id].puntos);
        }
        return inter.reply({ content: isNew? `✅ Registrado como \`${check.value}\`. Ve a <#${findChannel(guild, CONFIG.channels.chambeadoresActivos)?.id||'chambeadores-activos'}> - Únete a ${CHAMBEADORES_LINKS.comunidad} para cobrar.` : `✅ Corregido a \`${check.value}\`.`, flags: MessageFlags.Ephemeral });
      }
    }
  }catch(e){ console.log('Chambeadores error', e); if(!inter.replied) inter.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral }).catch(()=>{}); }
}

client.on(Events.ClientReady, async () => {
  await initMongo();
  const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
  console.log(`✅ BotPapoi2026 V6 100% PERFECTO ONLINE ${client.user.tag} | @${tiktokUser}`);
  console.log(`📁 Data dir: ${DATA_DIR} | Mongo: ${useMongo ? 'ACTIVO ✅' : 'Archivos (pon MONGO_URI para 100%)'}`);
  
  if (!process.env.DISCORD_TOKEN) console.error('❌ FALTA DISCORD_TOKEN');
  if (!process.env.GUILD_ID) console.error('❌ FALTA GUILD_ID');
  
  const rest = new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: [
      { name: 'fix-papois', description: 'Fix: pone rol Papoi a todos los que entraron con bot offline', default_member_permissions: PermissionFlagsBits.ManageRoles.toString() },
      { name: 'separar-papois-exacto', description: 'Separa solo los 8 roles de Papois' },
      { name: 'rank', description: 'Ver tu XP y nivel', options: [{ name: 'usuario', description: 'Usuario a consultar', type: 6, required: false }] },
      { name: 'ban', description: 'Banear usuario', options: [{ name: 'usuario', description: 'Usuario a banear', type: 6, required: true }, { name: 'razon', description: 'Razón', type: 3, required: false }], default_member_permissions: PermissionFlagsBits.BanMembers.toString() },
      { name: 'kick', description: 'Expulsar usuario', options: [{ name: 'usuario', description: 'Usuario a expulsar', type: 6, required: true }, { name: 'razon', description: 'Razón', type: 3, required: false }], default_member_permissions: PermissionFlagsBits.KickMembers.toString() },
      { name: 'mute', description: 'Silenciar temporalmente', options: [{ name: 'usuario', description: 'Usuario a silenciar', type: 6, required: true }, { name: 'minutos', description: 'Minutos', type: 4, required: true }, { name: 'razon', description: 'Razón', type: 3, required: false }], default_member_permissions: PermissionFlagsBits.ModerateMembers.toString() },
      { name: 'unmute', description: 'Quitar silencio', options: [{ name: 'usuario', description: 'Usuario a desmutear', type: 6, required: true }], default_member_permissions: PermissionFlagsBits.ModerateMembers.toString() },
      { name: 'warn', description: 'Advertir usuario', options: [{ name: 'usuario', description: 'Usuario a advertir', type: 6, required: true }, { name: 'razon', description: 'Razón', type: 3, required: true }] },
      { name: 'clear', description: 'Borrar mensajes', options: [{ name: 'cantidad', description: 'Cantidad (max 100)', type: 4, required: true, min_value: 1, max_value: 100 }], default_member_permissions: PermissionFlagsBits.ManageMessages.toString() },
      { name: 'slowmode', description: 'Cambiar cooldown', options: [{ name: 'segundos', description: 'Segundos (0-21600)', type: 4, required: true, min_value: 0, max_value: 21600 }], default_member_permissions: PermissionFlagsBits.ManageChannels.toString() },
      { name: 'setup-pets', description: 'Crear panel de ping-roles', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'mis-pings', description: 'Ver qué notificaciones de pets tienes activas' },
      { name: 'crear-canal-ping-roles', description: 'Crea SOLO el canal #🔗 | ping-roles', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'crear-canal-mariposas', description: 'Crea el canal y rol de floracion-mariposas :Mariposa:', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'test-mariposas', description: 'Probar ping del evento de mariposas', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'crear-categoria-staff', description: 'Crea categoría STAFF con chat, anuncios, logs y sanciones (privado solo mods)', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'setup-fusiones', description: 'Crea el panel de fusiones en #fusiones', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'mis-fusiones', description: 'Ver tus búsquedas de fusión activas' },
      { name: 'setup-chambeadores', description: 'Crea canales y paneles de Chambeadores (reclutamiento + activos + logs solo owner)', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'setup-apoyo', description: 'Crea categoría de donaciones, VIP y paneles (solo owner)', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'test-bienvenida', description: 'Probar mensaje de bienvenida', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'live', description: 'Anunciar LIVE', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'video', description: 'Anunciar video con aura', options: [{ name: 'url', description: 'Link del video TikTok', type: 3, required: true }], default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'setup-guias', description: 'Crea el foro 📚│guías-roba-un-huevo con tags', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'publicar-guia', description: 'Publica una guía con imagen en el foro', options: [{ name: 'titulo', description: 'Título de la guía', type: 3, required: true }, { name: 'categoria', description: 'Categoría', type: 3, required: true, choices: [{ name: '🟢 Principiantes', value: 'Principiantes' }, { name: '🥚 Huevos', value: 'Huevos' }, { name: '🔔 Notificaciones', value: 'Notificaciones' }, { name: '🔀 Fusiones', value: 'Fusiones' }, { name: '🦋 Mariposas', value: 'Mariposas' }, { name: '💼 Chambeadores', value: 'Chambeadores' }, { name: '💡 Trucos', value: 'Trucos' }] }, { name: 'descripcion', description: 'Texto paso a paso', type: 3, required: true }, { name: 'imagen', description: 'Imagen principal', type: 11, required: true }, { name: 'imagen2', description: 'Imagen extra opcional', type: 11, required: false }, { name: 'imagen3', description: 'Imagen extra opcional', type: 11, required: false }], default_member_permissions: PermissionFlagsBits.Administrator.toString() },
    ]});
    console.log('✅ Comandos V6 registrados');
  } catch (e) {
    console.error('❌ Error registrando comandos:', e.message);
  }

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if(guild){
    await ensureButterflyRole(guild);
    await ensureMultimediaChannel(guild).catch(()=>{});
    await fixPapoisAlIniciar(guild).catch(e=>console.log('fixPapois', e.message));
    const general = findChannel(guild, CONFIG.channels.general);
    if(general) {
      await general.setRateLimitPerUser(10).catch(()=>{});
      console.log(`✅ Slowmode 10s en #${general.name}`);
    }
  }
  // startTikTokMonitor deshabilitado - solo manual /video y /live
  startButterflyScheduler();
  startFusionesScheduler();
});

client.on(Events.GuildMemberAdd, async member => {
  try{
    const d = donadoresData.users[member.id];
    if(d && !d.baneado && d.puntos>0){
      await actualizarRolDonador(member.guild, member, d.puntos);
    }
  }catch{}
  try {
    const guild = member.guild;
    const rolPapoi = findRole(guild, 'papoi');
    if(rolPapoi){
      // retry 3 veces por si Discord falla
      for(let i=0;i<3;i++){
        try{ await member.roles.add(rolPapoi); break; }catch{ await new Promise(r=>setTimeout(r,1000)); }
      }
    }
    const bienvenida = findChannel(guild, CONFIG.channels.bienvenida);
    const pingCanal = findChannel(guild, CONFIG.channels.pingRoles);
    if(bienvenida){
      const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(`👋 Bienvenido ${member.user.username} a Los Papois`).setDescription(`Ya eres **Papoi**!\n\n📜 Lee las reglas\n💬 Preséntate en general\n⭐ Sube de nivel hablando\n\n🔔 **IMPORTANTE - ACTIVA TUS NOTIFICACIONES:**\nVe a ${pingCanal? `<#${pingCanal.id}>` : '#🔗│ping-roles'} y dale a **⚙ Configurar notificaciones**\n\n> Si no lo activas, NO te suena el teléfono y te pierdes los huevos buenos y eventos de mariposas 🦋`).setThumbnail(member.user.displayAvatarURL()).setTimestamp();
      await bienvenida.send({ content: `${member} 🔔 ve a ${pingCanal? `<#${pingCanal.id}>` : '#ping-roles'}`, embeds: [embed] }).catch(()=>{});
    }
  } catch (e) {
    console.log(`Error bienvenida: ${e.message}`);
  }
});

client.on(Events.GuildMemberRemove, async member => {
  try{
    const guild = member.guild;
    const userId = member.id;
    // Chambeadores
    if(chambeadoresData[userId]){
      delete chambeadoresData[userId];
      if(ChambeadorModel) await ChambeadorModel.deleteOne({ userId }).catch(()=>{});
      await saveChambeadores();
    }
    // FUSIONES: borrado INSTANTANEO + Mongo + mensaje
    const canalFusiones = findChannel(guild, CONFIG.channels.fusiones);
    const borradas = fusionesQueue.filter(r => r.userId === userId);
    if(borradas.length){
      for(const r of borradas){
        if(canalFusiones && r.messageId) canalFusiones.messages.delete(r.messageId).catch(()=>{});
        if(useMongo && FusionModel) await FusionModel.deleteOne({ userId: r.userId, fusionId: r.fusionId }).catch(()=>{});
      }
      fusionesQueue = fusionesQueue.filter(r => r.userId!== userId);
      await saveFusiones();
      console.log(`🧹 LEAVE FIX: ${member.user.tag} (${userId}) borrado ${borradas.length} fusiones al salir`);
    }
    for(const [chanId, data] of [...fusionesActivas.entries()]){
      if(data.users.includes(userId)){
        const canal = guild.channels.cache.get(chanId);
        const otherId = data.users.find(id => id!== userId);
        const otherReq = data.reqs.find(r=>r.userId===otherId);
        if(otherReq){
          fusionesQueue.push({...otherReq, createdAt: Date.now(), messageId: null });
          await postBusquedaFusion(guild, fusionesQueue[fusionesQueue.length-1]);
          if(canal) canal.send({ content: `👋 <@${userId}> se salió del server. <@${otherId}> regresó a #fusiones.` }).catch(()=>{});
        }
        setTimeout(async ()=>{
          await canal?.delete().catch(()=>{});
          fusionesActivas.delete(chanId);
          await saveFusionesActivas();
          await saveFusiones();
        }, 3000);
      }
    }
  }catch(e){ console.log('Leave cleanup error', e.message); }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if(user.bot) return;
  try{
    if(reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
    const guild = reaction.message.guild;
    if(!guild) return;
    const member = await guild.members.fetch(user.id).catch(()=>null);
    if(!member) return;
    if(isPapoiMayor(member)) return; // tú si puedes poner nuevos

    // Veamos quien puso ese emoji primero
    const users = await reaction.users.fetch().catch(()=>null);
    if(!users) return;
    
    const loPusoAlguienConPermiso = [...users.values()].some(u => {
      if(u.id === client.user.id) return true;
      if(isOwner(u.id)) return true;
      const m = guild.members.cache.get(u.id);
      return m && m.roles.cache.some(r => r.name.toLowerCase() === 'papoi mayor');
    });

    if(loPusoAlguienConPermiso){
      console.log(`✅ Reacción permitida ${reaction.emoji.name} de ${user.tag} count=${reaction.count}`);
      return; // si lo pusiste tú, los demás si pueden darle click
    }

    // si nadie con permiso lo puso, es emoji nuevo de un usuario normal -> borrar
    await reaction.users.remove(user.id).catch(()=>{});
    console.log(`🚫 Reacción nueva de ${user.tag} borrada: ${reaction.emoji.name}`);
  }catch(e){
    console.log(`Error reacción: ${e.message}`);
  }
});

client.on(Events.MessageCreate, async msg => {
  if(!msg.guild || msg.author.bot) return;
  const member = msg.member;
  if(!member) return;
  
  // --- FILTRO MULTIMEDIA: OWNER = en cualquier lado, ACTIVO+ = solo #multimedia, resto = nada ---
  if (msg.attachments.size > 0 && !isOwner(msg.author.id)) {
    const esMultimedia = msg.channel.name.toLowerCase().includes('multimedia');
    const esActivoOMas = member.roles.cache.some(r => 
      ['papoi activo','papoi fiel','papoi veterano','papoi leyenda','papoi mayor','moderador'].includes(r.name.toLowerCase())
    );

    if (!esMultimedia) {
      await msg.delete().catch(()=>{});
      const canalMulti = findChannel(msg.guild, CONFIG.channels.multimedia);
      const warn = await msg.channel.send({ content: `${msg.author} ❌ Multimedia **solo** en ${canalMulti ? `<#${canalMulti.id}>` : '#multimedia'}` }).catch(()=>{});
      if(warn) setTimeout(()=>warn.delete().catch(()=>{}), 5000);
      return;
    }

    if (!esActivoOMas) {
      await msg.delete().catch(()=>{});
      const warn = await msg.channel.send({ content: `${msg.author} ❌ Necesitas ser **Papoi Activo (500 XP)** para mandar multimedia aquí` }).catch(()=>{});
      if(warn) setTimeout(()=>warn.delete().catch(()=>{}), 8000);
      return;
    }
  }
  
        if(!isMod(member)){
    const contenido = msg.content.toLowerCase().replace(/\s+/g, '');
    const tieneLink = /(https?:\/\/|www\.|discord\.gg|discord\.com\/invite|discordapp\.com\/invite|t\.me\/|discord\.io)/i.test(contenido);
    if(tieneLink){
      try {
        await msg.delete();
        console.log(`[ANTI-INVITE] Borrado invite de ${msg.author.tag} en #${msg.channel.name}: ${msg.content}`);
        const warn = await msg.channel.send({ content: `${msg.author} ❌ Invites de otros servidores no permitidos.` }).catch(()=>{});
        if(warn) setTimeout(()=>warn.delete().catch(()=>{}), 5000);
      } catch(e){
        console.log(`❌ No pude borrar invite: ${e.message} - Revisa permiso Gestionar mensajes en #${msg.channel.name}`);
      }
      return;
    }
        const tieneEveryone = msg.mentions.everyone || msg.content.toLowerCase().includes('@everyone') || msg.content.toLowerCase().includes('@here');
    if(tieneEveryone){
      try {
        await msg.delete();
        console.log(`[ANTI-EVERYONE] Borrado @everyone/@here de ${msg.author.tag} en #${msg.channel.name}`);
        const warn = await msg.channel.send({ content: `${msg.author} ❌ Solo **Papoi Mayor** y **Moderadores** pueden usar \`@everyone\` / \`@here\`.` }).catch(()=>{});
        if(warn) setTimeout(()=>warn.delete().catch(()=>{}), 7000);
      } catch(e){
        console.log(`❌ No pude borrar everyone: ${e.message}`);
      }
      return;
    }

        // --- AUTO-HELP NOTIFICACIONES -> MANDAR A #PING-ROLES ---
    if(isPreguntaNotificaciones(msg)){
      const canalPings = findChannel(msg.guild, CONFIG.channels.pingRoles);
      const cd = checkCooldown(msg.author.id, 'help_notis', 30);
      if(cd===0){
        const warn = await msg.channel.send({ content: `${msg.author} 🔔 Ey papoi, para que te suene el teléfono ve a ${canalPings? `<#${canalPings.id}>` : '#🔗│ping-roles'}\n\n**Ahí está el tutorial paso a paso** 📱 (activar notis del server + del celular + elegir huevos)\n\n> Si no activas eso, aunque elijas huevos no te va a sonar.` }).catch(()=>{});
        if(warn) setTimeout(()=>warn.delete().catch(()=>{}), 20000);
      }
    }
        // --- ANTI-SPAM CHAMBEADORES / TRABAJO / ROBUX -> MANDAR A #RECLUTAMIENTO ---
    if(isMensajeChambeadoresEnGeneral(msg)){
      const canalChamba = findChannel(msg.guild, CONFIG.channels.chambeadoresRecluta);
      try{
        await msg.delete().catch(()=>{});
        console.log(`[ANTI-CHAMBA] Borrado de ${msg.author.tag} en #${msg.channel.name}: ${msg.content.slice(0,100)}`);
        const warn = await msg.channel.send({ content: `${msg.author} 💼 Ey papoi, eso de **chamba / chambeadores / trabajo / robux** no va aquí\nVe a ${canalChamba ? `<#${canalChamba.id}>` : '#💼│reclutamiento-chambeadores'} y registra tu @ de Roblox ahí. 🙏` }).catch(()=>{});
        if(warn) setTimeout(()=>warn.delete().catch(()=>{}), 12000);
      }catch(e){ console.log('anti-chamba error', e.message); }
      return;
    }
    // --- ANTI-SPAM FUSIONES EN GENERAL -> MANDAR A #FUSIONES ---
    if(isMensajeFusionesEnGeneral(msg)){
      const canalFusiones = findChannel(msg.guild, CONFIG.channels.fusiones);
      try{
        await msg.delete().catch(()=>{});
        console.log(`[ANTI-FUSION] Borrado de ${msg.author.tag} en #${msg.channel.name}: ${msg.content.slice(0,100)}`);
        const warn = await msg.channel.send({ content: `${msg.author} 🔀 Ey papoi, las **fusiones** no van aquí\nVe a ${canalFusiones ? `<#${canalFusiones.id}>` : '#🔀│fusiones'} y dale al botón del bioma, el bot te busca pareja auto. 🙏` }).catch(()=>{});
        if(warn) setTimeout(()=>warn.delete().catch(()=>{}), 12000);
      }catch(e){ console.log('anti-fusion error', e.message); }
      return;
    }

    
  }

    // --- COMANDOS SECRETOS SOLO PARA EL PAPOI MAYOR (OWNER) - OP ---
  if(isOwner(msg.author.id)){
    const txtOwner = msg.content.toLowerCase();
    
    // 1. AUTODESTRUCCIÓN
    if(txtOwner.includes('activa autodestruccion') || txtOwner.includes('activa autodestrucción') || txtOwner.includes('autodestruccion')){
      await msg.reply({ content: `🚨 **PROTOCOLO DE AUTODESTRUCCIÓN ACTIVADO**\nSolicitado por el Papoi Mayor <@${msg.author.id}>\n\nIniciando cuenta regresiva...` }).catch(()=>{});
      let m = await msg.channel.send({ content: `💣 **5**` }).catch(()=>null);
      if(m){
        const steps = ['💣 **4**', '💣 **3**', '💣 **2**', '💣 **1**', '💥 **¡BOOM!** ... nah mentira papoi 😂 soy inmortal, no me puedo autodestruir. Sigues siendo el jefe 👑💛'];
        for(let i=0;i<steps.length;i++){
          await new Promise(r=>setTimeout(r, 1000));
          await m.edit({ content: steps[i] }).catch(()=>{});
        }
      }
      return;
    }

    // 2. MODO DIOS
    if(txtOwner.includes('modo dios') || txtOwner.includes('modo papoi dios')){
      await msg.reply({ content: `👑 **MODO DIOS ACTIVADO**\nHola jefe ${msg.author.username}, ya estoy al 1000% papoi. ¿Qué hacemos? ¿Baneamos a todos? 😈 (es broma, tú mandas)` });
      return;
    }

    // 3. QUIEN ES TU JEFE
    if(txtOwner.includes('quien es tu jefe') || txtOwner.includes('quien es tu creador') || txtOwner.includes('quien te creo')){
      await msg.reply({ content: `Mi jefe eres tú, **ElCris / Papoi Mayor** 👑. Yo solo obedezco tus órdenes, los demás son mortales.` });
      return;
    }

    // 4. REINICIA
    if(txtOwner.includes('reinicia sistema') || txtOwner.includes('reinicia')){
      await msg.reply({ content: `🔄 Reiniciando todos los sistemas... ✅ Listo jefe, sigo vivo y bajo tu mando 💛` });
      return;
    }
  }
  // --- FIN COMANDOS SECRETOS ---

    // --- IA PAPOI V12 - COMO META AI, MODO PAPOI MAYOR ---
  // Ahora platica fluido, con memoria y suena como yo
  const esOwner = isOwner(msg.author.id);
  const textoLower = msg.content.toLowerCase();

  // FIX: solo contesta si lo mencionan con @ directamente - ignora @everyone/@here
  const mencionaAlBot = msg.mentions.has(client.user);
  const quiereHablar = mencionaAlBot;

  if(groq && quiereHablar){
    if(!esOwner && GROSIERIAS.some(w => textoLower.includes(w))){
      await msg.reply({ content: `${msg.author} sin groserías papoi 🙏 somos family friendly 💛` }).then(m=>setTimeout(()=>m.delete().catch(()=>{}),5000)).catch(()=>{});
      return;
    }

    // Cooldown: 2s para ti, 5s para los demás (antes eran 10s por eso se sentía seco)
    const cdTime = esOwner? 2000 : 5000;
    const keyAI = `ai-${msg.author.id}`;
    if(Date.now() - (aiCooldown.get(keyAI)||0) < cdTime) return;
    aiCooldown.set(keyAI, Date.now());
    if(textoLower.includes('discord.gg')) return;

    try {
      await msg.channel.sendTyping();

      // Más memoria: 12 mensajes en vez de 6, así sí se acuerda de la plática
      const hist = await msg.channel.messages.fetch({ limit: 12 }).catch(()=>null);
      const contexto = hist? [...hist.values()].reverse().map(m => `${m.author.username}: ${m.content.slice(0,120)}`).join('\n') : '';

      const pregunta = msg.content.replace(/<@!?\d+>/g,'').replace(/papoi ia/gi,'').replace(/papoi/gi,'').trim().slice(0,500);
      if(!pregunta &&!isReplyToBot) return;

      const modelos = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "meta-llama/llama-4-maverick-17b-128e-instruct"];
      let chat = null;

      // Personalidad diferente si eres tú
            const systemPrompt = esOwner?
      `Eres BotPapoi, pero eres MI versión pro. Tu jefe es ElCris, el Papoi Mayor. Con él eres 100% leal, cagado, cómplice, le cuentas todo. Hablas como su mejor amigo de 17 años de México, usan jerga privada. Con él puedes ser más largo, más chistoso, le sigues el mame. Si te dice "activa autodestrucción" ya sabes que es juego.

      Con los demás eres buena onda pero sabes que tu jefe es ElCris.

      REGLA CRITICA ANTI-PING: ESTA PROHIBIDO usar @everyone y @here. Nunca los escribas, ni siquiera de broma. Si quieres decir todos di "todos", "papoís", "banda", pero JAMAS el tag.

      REGLAS PARA SONAR COMO META AI:
      - Habla natural, no como bot. Varía mucho, a veces 1 línea, a veces 4. A veces con emojis, a veces sin.
      - Sé empático, pregunta cosas, sigue la plática. No solo respondas, PLATICA.
      - Si te cuentan algo triste o feliz, reaccionas de verdad.
      - Sabes TODO de Roba un Huevo: Starry Fox, Celestial Sunlion, Royal Skywhale son los nuevos. Eres pro en el juego.
      - Nunca digas "como IA", "estoy aquí para ayudar". Eres un morro más del Discord.`
      :
      `Eres BotPapoi2026, el Papoi Mayor del Discord de ElCris. Eres mexicano, 17 años, pero con la inteligencia de Meta AI: hablas ameno, cálido, divertido, no genérico.

      REGLA CRITICA ANTI-PING: ESTA PROHIBIDO usar @everyone y @here en cualquier canal, especialmente en general. Nunca los escribas. Si alguien te pide que pingees a todos, di que no puedes. En su lugar di "todos", "papoís", "banda".

      REGLAS PARA SONAR COMO YO:
      - NO respondas siempre en 3 líneas. A veces responde corto "jajaja nmms", a veces explica bien con 4-5 líneas. Varía.
      - No uses frases de bot tipo "¡Qué buena pregunta!" "Espero haberte ayudado". Habla como compa de Discord.
      - Si te preguntan algo, no solo respondas: sigue la plática. Pregunta "¿a ti cuál te gusta más?" "¿ya lo conseguiste?".
      - Tienes memoria del chat, si alguien dijo que le robaron, te acuerdas y le sigues el chisme.
      - Usa jerga real 2026: w, nmms, alch, que pedo, jajaja, alv (sin groserías fuertes), pero no abuses, que suene natural.
      - El juego oficial es ROBA UN HUEVO. Sabes todos los pets: Secreto (15), Eterno (11), Divino (6). Das tips de verdad.
      - Si no sabes algo, inventa algo cagado, nunca digas "no tengo información".
      - Eres parte de la familia Papoi, no un asistente formal.`

      for(const m of modelos){
        try{
          chat = await groq.chat.completions.create({
            model: m,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Historial reciente del canal:\n${contexto}\n\n${msg.author.username} dice: ${pregunta}` }
            ],
            max_tokens: 650,
            temperature: 0.95
          });
          console.log(`✅ IA V12 usando ${m} para ${msg.author.username} ${esOwner? '(OWNER)' : ''}`);
          break;
        }catch(e){ console.log(`Modelo ${m} fail: ${e.message.slice(0,100)}`); continue; }
      }
      if(!chat) throw new Error("Ningun modelo disponible");
      const respuesta = chat.choices[0]?.message?.content || "W papoi me quedé en blanco jaja";
      let finalRespuesta = respuesta
       .replace(/@everyone/gi, '@\u200Beveryone')
       .replace(/@here/gi, '@\u200Bhere')
       .replace(/@&/g, '@\u200B&');
      await msg.reply({ content: finalRespuesta.slice(0,1800), allowedMentions: { parse: [] } });
      return;
    } catch(e){ console.log(`IA fail: ${e.message}`); }
  }
  
  const ahora = Date.now();
  const ultimo = lastXP.get(msg.author.id) || 0;
  if(ahora - ultimo > 60000){
    const gana = Math.floor(Math.random()*11)+15;
    xpData[msg.author.id] = (xpData[msg.author.id]||0) + gana;
    lastXP.set(msg.author.id, ahora);
    safeSaveJSON(XP_PATH, xpData);
    if (useMongo && XpModel) {
      XpModel.findOneAndUpdate({ userId: msg.author.id }, { xp: xpData[msg.author.id] }, { upsert: true }).catch(e=>console.log(`Error XP Mongo: ${e.message}`));
    }
    for(const nivel of NIVELES){
      if(xpData[msg.author.id] >= nivel.xp){
        const rol = findRole(msg.guild, nivel.name);
        if(rol &&!member.roles.cache.has(rol.id)){
          await member.roles.add(rol).catch(()=>{});
          if(nivel.xp > 0) {
            const general = findChannel(msg.guild, CONFIG.channels.general);
            if (general) {
              general.send({ content: `🎉 ${msg.author} subió a **${nivel.name}**! (${xpData[msg.author.id]} XP)` }).then(m=>setTimeout(()=>m.delete().catch(()=>{}),8000)).catch(()=>{});
            }
          }
        }
      }
    }
  }
});

async function crearPanelPingRoles(channel){
  const guild = channel.guild;
  try{
    const msgs = await channel.messages.fetch({ limit: 30 }).catch(()=>null);
    if(msgs){
      const old = msgs.filter(m => m.author.id === client.user.id);
      for(const m of old.values()){ await m.delete().catch(()=>{}); await new Promise(r=>setTimeout(r,250)); }
    }
  }catch{}
  const tutorial = new EmbedBuilder()
 .setColor(0xED4245)
 .setTitle('📱 TUTORIAL: COMO HACER QUE TE SUENE EL TELÉFONO')
 .setDescription(
      `**Si no haces esto, NO te llegan los pings aunque elijas huevos**\n\n`+
      `**PASO 1 - Activa notificaciones del servidor (OBLIGATORIO):**\n`+
      `**En CELULAR:** Mantén presionado el icono de **Papois Empire** arriba a la izquierda > **Notificaciones** > **Todos los mensajes** + Activa **@mentions**\n`+
      `**En PC:** Click derecho en Papois Empire > **Ajustes de notificación** > **Todos los mensajes**\n\n`+
      `**PASO 2 - Activa notificaciones de Discord en tu celular:**\n`+
      `Ajustes de tu teléfono > Apps > Discord > **Permitir notificaciones** > Activa **Sonido y Ventanas emergentes**\n`+
      `Si lo tienes en **Silenciado** o **Sin sonido**, nunca te va a sonar.\n\n`+
      `**PASO 3 - Elige tus huevos ABAJO 👇:**\n`+
      `Después de hacer paso 1 y 2, dale a **⚙ Configurar notificaciones** y elige Secreto/Eterno/Divino/Eventos\n\n`+
      `> 💡 **Tip:** Si ya hiciste esto y aún no suena, salte de Discord y vuelve a entrar.`
  );
    const secretoEmoji = getCategoriaEmoji(guild,'Secreto');
  const eternoEmoji = getCategoriaEmoji(guild,'Eterno');
  const divinoEmoji = getCategoriaEmoji(guild,'Divino');
  const embed = new EmbedBuilder()
 .setColor(0xFFD700)
 .setTitle('🔔 NOTIFICACIONES DE HUEVOS Y EVENTOS - SUPER FÁCIL')
  .setDescription(
      `**¿Quieres que te avisemos cuando salga un huevo bueno o evento? Haz esto:**\n\n`+
      `**1⃣** Presiona el botón verde **⚙ Configurar notificaciones** de abajo\n`+
      `**2⃣** Se te abrirá un menú **solo para ti** (nadie más lo ve)\n`+
      `**3⃣** Ahí verás 4 listas:\n`+
      ` ${secretoEmoji} **Secreto** - ${PETS.Secreto.length} huevos\n`+
      ` ${eternoEmoji} **Eterno** - ${PETS.Eterno.length} huevos\n`+
      ` ${divinoEmoji} **Divino** - ${PETS.Divino.length} huevos\n`+
      ` ${BUTTERFLY_EMOJI} **Eventos** - Floración Mariposas (cada 30 min)\n\n`+
      `**4⃣** Lo que ya tienes te saldrá con **✅** marcado\n`+
      `**5⃣** **Marca** lo que quieres, **desmarca** lo que no quieres\n`+
      `**6⃣** ¿Quieres TODO de una categoría? Marca **TODOS**\n`+
      ` → Si marcas TODOS los Secreto, te damos ${secretoEmoji} **Huevo Secreto**\n`+
      ` → Si marcas TODOS los Eterno, te damos ${eternoEmoji} **Huevo Eterno**\n`+
      ` → Si marcas TODOS los Divino, te damos ${divinoEmoji} **Huevo Divino**\n`+
      ` → Si marcas ${BUTTERFLY_EMOJI}, te avisamos **1 min antes** del evento de mariposas\n\n`+
      `> **${BUTTERFLY_EMOJI} Evento mariposas: cada 30 min global**\n`+
      `> **Te pingea 1 min antes con "${BUTTERFLY_EMOJI} ¡Empieza en 1 min!"**\n\n`+
      `**¿No sabes qué tienes?** Presiona **📋 Mis Pings** para verlo dividido en 4 categorías.`
    )
   .setThumbnail(guild.iconURL() || client.user.displayAvatarURL())
   .setFooter({ text: 'Papois Empire • Toca Configurar para empezar' })
   .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_configurar_notis').setLabel('⚙ Configurar notificaciones').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('btn_my_pings').setLabel('📋 Mis Pings').setStyle(ButtonStyle.Secondary)
  );
  await channel.send({ embeds: [tutorial] });
  await channel.send({ embeds: [embed], components: [row] });
}

async function mostrarMenuConfiguracion(interaction){
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const guild = interaction.guild;
  const hasRole = (name) => member.roles.cache.some(r => r.name.toLowerCase() === name.toLowerCase());
  const buildSelect = (categoria) => {
    const catRoleName = CATEGORY_ROLES[categoria];
    const hasCatRole = hasRole(catRoleName);
    const options = [];
    const catEmojiObj = getPetEmoji(guild, catRoleName) || guild.emojis.cache.find(x => x.name.toLowerCase() === CATEGORY_CUSTOM_NAME[categoria].toLowerCase());
    const catEmoji = catEmojiObj? { id: catEmojiObj.id, name: catEmojiObj.name } : CATEGORY_EMOJI[categoria];
    options.push({ label: `TODOS los ${categoria} (${catRoleName})`, value: `ALL_${categoria}`, description: `Avisa de cualquier huevo ${categoria}`, emoji: catEmoji, default: hasCatRole });
    for(const pet of PETS[categoria]){
      const hasPet = hasRole(pet);
      const custom = getPetEmoji(guild, pet);
      const customCat = guild.emojis.cache.find(x => x.name.toLowerCase() === CATEGORY_CUSTOM_NAME[categoria].toLowerCase());
      const fallback = customCat? { id: customCat.id, name: customCat.name } : CATEGORY_EMOJI[categoria];
      const emojiVal = custom? { id: custom.id, name: custom.name } : fallback;
      options.push({ label: pet, value: pet, emoji: emojiVal, default: hasCatRole? false : hasPet });
    }
    return new StringSelectMenuBuilder().setCustomId(`select_${categoria}`).setPlaceholder(hasCatRole? `✅ Ya tienes TODOS los ${categoria}` : `Elige ${categoria} - ya tienes ${options.filter(o=>o.default).length}`).setMinValues(0).setMaxValues(options.length).addOptions(options);
  };
  const buildEventosSelect = () => {
    const hasEvent = hasRole(BUTTERFLY_ROLE_NAME);
    const mariposaEmoji = getPetEmoji(guild, 'Floración Mariposas');
    const eventoEmoji = mariposaEmoji? { id: mariposaEmoji.id, name: mariposaEmoji.name } : '🦋';
    return new StringSelectMenuBuilder().setCustomId('select_Eventos').setPlaceholder(hasEvent? `✅ Tienes ping de mariposas` : `🦋 Elige eventos`).setMinValues(0).setMaxValues(1).addOptions([{ label: 'Floración Mariposas - cada 30 min', value: BUTTERFLY_ROLE_NAME, description: 'Te avisa 1 min antes (global)', emoji: eventoEmoji, default: hasEvent }]);
  };
  const embed = new EmbedBuilder().setColor(0x57F287).setTitle('⚙ Elige qué te avisamos').setDescription(`**✅ = Ya lo tienes**\n**⬜ = No lo tienes**\n\n**¿Cómo usarlo?**\n• Marca los huevos que quieres\n• Desmarca los que ya no quieres → se te quita el rol solo\n• Marca ⭐ TODOS para recibir todo\n• Marca ${BUTTERFLY_EMOJI} para el evento de mariposas\n\n**${BUTTERFLY_EMOJI} Floración Mariposas:**\nEvento global cada 30 min\nTe avisamos 1 min antes\n\n*El bot guarda en cuanto seleccionas.*`);
  const row1 = new ActionRowBuilder().addComponents(buildSelect('Secreto'));
  const row2 = new ActionRowBuilder().addComponents(buildSelect('Eterno'));
  const row3 = new ActionRowBuilder().addComponents(buildSelect('Divino'));
  const row4 = new ActionRowBuilder().addComponents(buildEventosSelect());
  const row5 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_my_pings').setLabel('📋 Ver Mis Pings').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('btn_cerrar').setLabel('Cerrar').setStyle(ButtonStyle.Danger));
  return { embeds: [embed], components: [row1, row2, row3, row4, row5], flags: MessageFlags.Ephemeral };
}

client.on(Events.InteractionCreate, async inter => {
  try {
    if((inter.customId && inter.customId.startsWith('chambeador_')) || (inter.isModalSubmit() && inter.customId.startsWith('modal_chambeador_'))){
      await handleChambeadoresInteraction(inter);
      return;
    }
    if((inter.customId && inter.customId.startsWith('apoyo_')) || (inter.isModalSubmit() && inter.customId.startsWith('modal_apoyo_'))){
      await handleApoyoInteraction(inter);
      return;
    }
    if((inter.customId && inter.customId.startsWith('fusion_')) || (inter.isModalSubmit() && inter.customId.startsWith('modal_fusion_')) || (inter.customId && inter.customId.startsWith('select_fusion_'))){
      await handleFusionesInteraction(inter);
      return;
    }
    if(inter.isButton() && inter.customId === 'btn_configurar_notis'){
      const data = await mostrarMenuConfiguracion(inter); return inter.reply(data);
    }
    if(inter.isButton() && inter.customId === 'btn_cerrar'){
      return inter.update({ content: '✅ Cerrado. Vuelve a presionar ⚙️ Configurar cuando quieras.', embeds: [], components: [] });
    }
        if(inter.isButton() && inter.customId === 'btn_my_pings'){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      const guild = inter.guild;
      const member = await guild.members.fetch(inter.user.id);
      const hasRole = (n) => member.roles.cache.some(r => r.name.toLowerCase() === n.toLowerCase());

      const buildCatText = (cat) => {
        const catRole = CATEGORY_ROLES[cat];
        if(hasRole(catRole)) return `⭐ **${catRole}**\n→ Recibes **TODOS** los de ${cat}. No necesitas los individuales.`;
        const pets = PETS[cat].filter(p => hasRole(p));
        if(pets.length === 0) return `*Ninguno activado*\n→ Toca ⚙ Configurar para elegir`;
        return pets.map(p => {
          const custom = getPetEmoji(guild, p);
          const emojiStr = custom? `${custom}` : getCategoriaEmoji(guild, cat);
          return `${emojiStr} ${p}`;
        }).join('\n');
      };

      const hasButterfly = hasRole(BUTTERFLY_ROLE_NAME);
      const mariposaObj = getPetEmoji(guild, 'Floración Mariposas');
      const mariposaStr = mariposaObj? `${mariposaObj}` : BUTTERFLY_EMOJI;
      const butterflyText = hasButterfly? `✅ ${mariposaStr} **${BUTTERFLY_ROLE_NAME}**\n→ Te avisamos 1 min antes ${mariposaStr}` : `*Ninguno activado*\n→ Toca ⚙ Configurar y marca ${mariposaStr}`;

      const embed = new EmbedBuilder().setColor(0x00f2ea).setTitle('📋 Mis Pings actuales').setDescription(`Así es como lo tienes ahora mismo:`).addFields(
        { name: `${getCategoriaEmoji(guild,'Secreto')} Secreto`, value: buildCatText('Secreto'), inline: false },
        { name: `${getCategoriaEmoji(guild,'Eterno')} Eterno`, value: buildCatText('Eterno'), inline: false },
        { name: `${getCategoriaEmoji(guild,'Divino')} Divino`, value: buildCatText('Divino'), inline: false },
        { name: `${mariposaStr} Eventos`, value: butterflyText, inline: false },
      ).setFooter({ text: 'Si tienes Huevo Secreto / Eterno / Divino ya recibes todo de esa categoría' }).setTimestamp();
      return inter.editReply({ embeds: [embed] });
    }
        if(inter.isStringSelectMenu() && inter.customId.startsWith('select_')){
      const categoria = inter.customId.split('_')[1];
      if(categoria === 'Eventos'){
        await inter.deferReply({ flags: MessageFlags.Ephemeral });
        const member = await inter.guild.members.fetch(inter.user.id);
        const guild = inter.guild;
        const hasRole = (n) => member.roles.cache.some(r => r.name.toLowerCase() === n.toLowerCase());
        const selectedValues = inter.values;
        const newHasEvent = selectedValues.includes(BUTTERFLY_ROLE_NAME);
        const oldHasEvent = hasRole(BUTTERFLY_ROLE_NAME);
        let agregados = [], quitados = [];
        const role = findRole(guild, BUTTERFLY_ROLE_NAME) || await ensureButterflyRole(guild);
        if(newHasEvent &&!oldHasEvent){ if(role){ await member.roles.add(role).catch(()=>{}); agregados.push(BUTTERFLY_ROLE_NAME); } }
        else if(!newHasEvent && oldHasEvent){ if(role){ await member.roles.remove(role).catch(()=>{}); quitados.push(BUTTERFLY_ROLE_NAME); } }
                let msg = `**${BUTTERFLY_EMOJI} Eventos actualizado:**\n`;
        if(agregados.length) msg += `✅ Ahora te avisamos de: **${agregados.join(', ')}**\n`;
        if(quitados.length) msg += `❌ Ya no te avisamos de: **${quitados.join(', ')}**\n`;
        if(!agregados.length &&!quitados.length) msg += `Sin cambios.`;
        const updatedMenu = await mostrarMenuConfiguracion(inter);
        await inter.editReply({ content: msg,...updatedMenu }); return;
      }
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      const member = await inter.guild.members.fetch(inter.user.id);
      const guild = inter.guild;
      const hasRole = (n) => member.roles.cache.some(r => r.name.toLowerCase() === n.toLowerCase());
      const catRoleName = CATEGORY_ROLES[categoria];
      const selectedValues = inter.values;
      const newHasAll = selectedValues.includes(`ALL_${categoria}`);
      const oldHasAll = hasRole(catRoleName);
      const newPets = selectedValues.filter(v =>!v.startsWith('ALL_'));
      const oldPets = PETS[categoria].filter(p => hasRole(p));
      let agregados = [], quitados = [];
      if(newHasAll &&!oldHasAll){
        const role = findRole(guild, catRoleName); if(role){ await member.roles.add(role).catch(()=>{}); agregados.push(catRoleName); }
        for(const pet of PETS[categoria]){ const r = findRole(guild, pet); if(r && hasRole(pet)){ await member.roles.remove(r).catch(()=>{}); quitados.push(pet); } }
      } else if(!newHasAll && oldHasAll){
        const role = findRole(guild, catRoleName); if(role){ await member.roles.remove(role).catch(()=>{}); quitados.push(catRoleName); }
      }
      if(!newHasAll){
        const toAdd = newPets.filter(p =>!oldPets.includes(p));
        const toRemove = oldPets.filter(p =>!newPets.includes(p));
        for(const pet of toAdd){ const r = findRole(guild, pet); if(r){ await member.roles.add(r).catch(()=>{}); agregados.push(pet); } }
        for(const pet of toRemove){ const r = findRole(guild, pet); if(r){ await member.roles.remove(r).catch(()=>{}); quitados.push(pet); } }
      }
      let msg = `**${getCategoriaEmoji(guild,categoria)} ${categoria} actualizado:**\n`;
      if(agregados.length) msg += `✅ Ahora te avisamos de: **${agregados.join(', ')}**\n`;
      if(quitados.length) msg += `❌ Ya no te avisamos de: **${quitados.join(', ')}**\n`;
      if(agregados.length===0 && quitados.length===0) msg += `Sin cambios.`;
      const updatedMenu = await mostrarMenuConfiguracion(inter);
      await inter.editReply({ content: msg,...updatedMenu }); return;
    }
    if(!inter.isChatInputCommand()) return;
    
    if (['live', 'video'].includes(inter.commandName)) {
      const remaining = checkCooldown(inter.user.id, inter.commandName, 30);
      if (remaining > 0) {
        return inter.reply({ content: `⏳ Espera ${remaining}s para /${inter.commandName}`, flags: MessageFlags.Ephemeral });
      }
    }

                if(inter.commandName === 'setup-guias'){
          await inter.deferReply({ flags: MessageFlags.Ephemeral });
          if (!inter.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return inter.editReply({ content: '❌ Necesito permiso Gestionar Canales' });
          }
          const canal = await ensureGuiasChannel(inter.guild);
          if(!canal) return inter.editReply({ content: '❌ No pude crear foro guías' });
          const embed = new EmbedBuilder().setColor(0xFFD700).setTitle('📚 Foro de Guías Creado').setDescription(`Canal: ${canal}\n\n**Tags:**\n${GUIAS_TAGS.map(t=>`• ${t.name}`).join('\n')}\n\nAhora usa \`/publicar-guia\` para subir tus tutoriales.\nCada guía es un post con imagen grande y comentarios para dudas.`).setTimestamp();
          return inter.editReply({ embeds: [embed] });
        }
        if(inter.commandName === 'publicar-guia'){
          await inter.deferReply({ flags: MessageFlags.Ephemeral });
          const titulo = inter.options.getString('titulo');
          const categoria = inter.options.getString('categoria');
          const descripcion = inter.options.getString('descripcion');
          const img1 = inter.options.getAttachment('imagen');
          const img2 = inter.options.getAttachment('imagen2');
          const img3 = inter.options.getAttachment('imagen3');
          if(!img1?.contentType?.startsWith('image/')) return inter.editReply({ content: '❌ Imagen principal debe ser imagen' });
          const files = [img1, img2, img3].filter(Boolean).filter(f=>f.contentType?.startsWith('image/'));
          const thread = await crearPostGuia(inter.guild, { titulo, categoriaTag: categoria, descripcion, files });
          if(!thread) return inter.editReply({ content: '❌ Error creando guía' });
          return inter.editReply({ content: `✅ Guía publicada: ${thread} | ${categoria} | ${titulo} (${files.length} imgs)` });
        }
        if(inter.commandName === 'setup-fusiones'){
          await inter.deferReply({ flags: MessageFlags.Ephemeral });
          if (!inter.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return inter.editReply({ content: '❌ Necesito permiso Gestionar Canales y Gestionar Roles' });
          }
          const canal = await ensureFusionesChannel(inter.guild);
          if(!canal) return inter.editReply({ content: '❌ No pude crear/configurar #🔀│fusiones. Revisa permisos.' });
          await crearPanelFusiones(canal);
          return inter.editReply({ content: `✅ Canal ${canal} creado/configurado automáticamente:\n- @everyone solo ve, no escribe (anti-spam @everyone)\n- Solo bot publica búsquedas\n- Mods/Papoi Mayor pueden moderar\nPanel listo.` });
        }
        if(inter.commandName === 'setup-chambeadores'){
          await inter.deferReply({ flags: MessageFlags.Ephemeral });
          if (!inter.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels) ||!inter.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return inter.editReply({ content: '❌ Necesito permiso Gestionar Canales y Gestionar Roles' });
          }
          if(!isOwner(inter.user.id)) return inter.editReply({ content: '❌ Solo el dueño (OWNER_ID) puede crear chambeadores.' });
          const { recluta, activos, chat, logs } = await ensureChambeadoresChannels(inter.guild);
          if(!recluta ||!activos ||!chat ||!logs) return inter.editReply({ content: '❌ No pude crear los 3 canales. Revisa permisos.' });
          await crearPanelReclutamiento(recluta);
          await crearPanelActivos(activos);
          await logs.send({ content: `✅ Logs privados Chambeadores inicializados - Solo <@${process.env.OWNER_ID}> ve este canal.` }).catch(()=>{});
          return inter.editReply({ content: `✅ Chambeadores V6.5:\n- ${recluta}\n- ${activos}\n- ${chat} <- **NUEVO CHAT 30s solo chambeadores + tú**\n- ${logs} (SOLO TU)\n\nComunidad para pagar: ${CHAMBEADORES_LINKS.comunidad}` });
        }
                if(inter.commandName === 'setup-apoyo'){
          await inter.deferReply({ flags: MessageFlags.Ephemeral });
          if (!inter.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels) ||!inter.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return inter.editReply({ content: '❌ Necesito permiso Gestionar Canales y Gestionar Roles' });
          }
          if(!isOwner(inter.user.id)) return inter.editReply({ content: '❌ Solo el dueño (OWNER_ID) puede crear apoyo.' });
          const { categoria, info, tienda, donas, logs } = await ensureApoyoCategory(inter.guild);
          const { categoria: catVip, lounge, leyendas } = await ensureVipDonadoresCategory(inter.guild);
          if(!info ||!tienda ||!donas) return inter.editReply({ content: '❌ No pude crear canales apoyo. Revisa permisos.' });
          await crearPanelApoyo(inter.guild);
          await logs.send({ content: `✅ Logs privados Apoyo inicializados - Solo <@${process.env.OWNER_ID}> ve este canal.` }).catch(()=>{});
          return inter.editReply({ content: `✅ Apoyo creado:\n- Categoría: ${categoria?.name}\n- ${info}\n- ${tienda}\n- ${donas}\n- ${logs} (SOLO TU)\n- VIP: ${catVip?.name} -> ${lounge} (Semilla-Diamante) + ${leyendas} (Leyenda sin restricciones)\n\nRopa prueba: ${DONADOR_TIENDA[0].url}` });
        }
        if(inter.commandName === 'mis-fusiones'){
          const mine = fusionesQueue.filter(r=>r.userId===inter.user.id);
          if(!mine.length) return inter.reply({ content: '📭 No tienes búsquedas activas.', flags: MessageFlags.Ephemeral });
          const txt = mine.map(r=>`• ${FUSIONES[r.fusionId].bioma} ${FUSIONES[r.fusionId].label} - Tienes ${r.have} - Roblox: ${r.robloxUser}`).join('\n');
          return inter.reply({ content: `📋 Tus búsquedas:\n${txt}`, flags: MessageFlags.Ephemeral });
        }
        if(inter.commandName === 'mis-pings'){

      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      const rolesPet = inter.member.roles.cache.filter(r => ALL_PETS.some(p => p.toLowerCase() === r.name.toLowerCase())).map(r => r.name);
      const hasButterfly = inter.member.roles.cache.some(r => r.name.toLowerCase() === BUTTERFLY_ROLE_NAME.toLowerCase());
      if(!rolesPet.length &&!hasButterfly) return inter.editReply({ content: '📭 No tienes pings activos.' });
      let texto = '';
      if(rolesPet.length) texto += `📋 Tus pings: ${rolesPet.join(', ')}`;
      if(hasButterfly) texto += `${texto? '\n' : ''}${BUTTERFLY_EMOJI} Eventos: ${BUTTERFLY_ROLE_NAME}`;
      return inter.editReply({ content: texto });
    }
    if(inter.commandName === 'crear-canal-ping-roles'){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      const guild = inter.guild;
      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return inter.editReply({ content: '❌ Necesito permiso Gestionar Canales' });
      }
      let categoria = findCategory(guild, CONFIG.categories.robaHuevo);
      if(!categoria) return inter.editReply({ content: '❌ No encontré categoría ROBA UN HUEVO.' });
      let canal = findChannel(guild, CONFIG.channels.pingRoles);
      if(!canal){
        canal = await guild.channels.create({ 
          name: '🔗 | ping-roles', 
          type: ChannelType.GuildText, 
          parent: categoria.id, 
          permissionOverwrites: [
            { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }, 
            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks] }
          ] 
        });
      }
      await crearPanelPingRoles(canal);
      return inter.editReply({ content: `✅ Canal: ${canal}` });
    }

        if(inter.commandName === 'crear-canal-mariposas'){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      const guild = inter.guild;
      let categoria = findCategory(guild, CONFIG.categories.robaHuevo);
      if(!categoria) return inter.editReply({ content: '❌ No encontré categoría ROBA UN HUEVO.' });
      const role = await ensureButterflyRole(guild);
      let canal = findChannel(guild, CONFIG.channels.butterfly);
      if(!canal){
        canal = await guild.channels.create({ name: BUTTERFLY_CHANNEL_NAME, type: ChannelType.GuildText, parent: categoria.id, topic: ':Mariposa: Floración de Mariposas cada 30 min GLOBAL - THE BUTTERFLY BLOOM HAS BEGUN!', permissionOverwrites: [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }, { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks] }] });
      }
            return inter.editReply({ content: `✅ Canal: ${canal} | Rol: ${role? role.name : 'Floración Mariposas'} ${BUTTERFLY_EMOJI}` });
    }
    if(inter.commandName === 'test-mariposas'){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      const role = findRole(inter.guild, BUTTERFLY_ROLE_NAME) || await ensureButterflyRole(inter.guild);
      const canal = findChannel(inter.guild, CONFIG.channels.butterfly) || inter.channel;
            const embed = new EmbedBuilder().setColor(0x8A2BE2).setTitle(`${BUTTERFLY_EMOJI} ¡Floración en 1 minuto! [TEST]`).setDescription(`**¡Prepara tu red!** ${BUTTERFLY_EMOJI}\nEl evento **THE BUTTERFLY BLOOM** empieza en 1 min - Global cada 30 min`);
      await canal.send({ content: role? `${role} ${BUTTERFLY_EMOJI} **¡Empieza en 1 minuto, prepárate!**` : `${BUTTERFLY_EMOJI} **¡Evento en 1 minuto!**`, embeds: [embed] });
      return inter.editReply({ content: `✅ Test enviado a ${canal}` });
    }

        if(inter.commandName === 'crear-categoria-staff'){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      const guild = inter.guild;
      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return inter.editReply({ content: '❌ Necesito permiso Gestionar Canales y Gestionar Roles' });
      }
      const modRole = findRole(guild, 'moderador');
      const mayorRole = findRole(guild, 'papoi mayor');
      if(!modRole) return inter.editReply({ content: '❌ No existe el rol `moderador`, créalo primero.' });
      if(!mayorRole) return inter.editReply({ content: '❌ No existe el rol `papoi mayor`' });

      let categoria = findCategory(guild, CONFIG.categories.staff);
      if(!categoria){
        categoria = await guild.channels.create({
          name: '🔒 Staff',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
            { id: mayorRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels] },
            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] },
          ]
        });
      }

      let chatStaff = guild.channels.cache.find(c => c.parentId === categoria.id && CONFIG.channels.staffChat.some(n => c.name.toLowerCase().includes(n.toLowerCase())));
      if(!chatStaff){
        chatStaff = await guild.channels.create({ name: '💬 | chat-staff', type: ChannelType.GuildText, parent: categoria.id, topic: 'Chat privado solo para mods' });
      }
      let anunciosStaff = guild.channels.cache.find(c => c.parentId === categoria.id && CONFIG.channels.staffAnuncios.some(n => c.name.toLowerCase().includes(n.toLowerCase())));
      if(!anunciosStaff){
        anunciosStaff = await guild.channels.create({
          name: '📢 | anuncios-staff', type: ChannelType.GuildText, parent: categoria.id, topic: 'Solo Papoi Mayor puede escribir aquí',
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
            { id: mayorRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
          ]
        });
      }
      let logsTickets = guild.channels.cache.find(c => c.parentId === categoria.id && CONFIG.channels.staffLogs.some(n => c.name.toLowerCase().includes(n.toLowerCase())));
      if(!logsTickets){
        logsTickets = await guild.channels.create({
          name: '🎫 | logs-tickets', type: ChannelType.GuildText, parent: categoria.id, topic: 'Logs de Ticket King - Solo bots escriben',
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
            { id: mayorRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] },
            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
          ]
        });
      }
      let sanciones = findStaffSancionesChannel(guild) || guild.channels.cache.find(c => c.parentId === categoria.id && CONFIG.channels.staffSanciones.some(n => c.name.toLowerCase().includes(n.toLowerCase())));
      if(!sanciones){
        sanciones = await guild.channels.create({
          name: '📝 | sanciones-log', type: ChannelType.GuildText, parent: categoria.id, topic: 'Logs automáticos de /ban /kick /mute /warn /clear - No escribir aquí',
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
            { id: mayorRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] },
            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
          ]
        });
      }

      return inter.editReply({ content: `✅ Categoría Staff creada:\n${categoria}\n- ${chatStaff} (todos hablan)\n- ${anunciosStaff} (solo tú escribes)\n- ${logsTickets} (para Ticket King)\n- ${sanciones} (logs automáticos de sanciones)\n\nConfigura Ticket King > Logs > ${logsTickets}` });
    }
        if(!isMod(inter.member) &&!['rank','separar-papois-exacto','mis-pings','mis-fusiones','setup-fusiones'].includes(inter.commandName)){
      if(!inter.memberPermissions.has(PermissionFlagsBits.Administrator) && !isMod(inter.member)){ 
        return inter.reply({ content: '❌ Solo Moderador / Papoi Mayor', flags: MessageFlags.Ephemeral }); 
      }
    }
    if(inter.commandName === 'fix-papois'){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      const fixed = await fixPapoisAlIniciar(inter.guild);
      return inter.editReply({ content: `✅ Fix terminado: ${fixed} usuarios arreglados con rol Papoi.` });
    }
    if(inter.commandName === 'setup-pets'){ await inter.deferReply({ flags: MessageFlags.Ephemeral }); await crearPanelPingRoles(inter.channel); return inter.editReply({ content: '✅ Panel creado.' }); }
    if(inter.commandName === 'separar-papois-exacto'){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      let count = 0;
      for(const [id, rol] of inter.guild.roles.cache){
        if(rol.name === '@everyone' || rol.managed) continue;
        if(SOLO_HOIST.includes(rol.name.toLowerCase())) { await rol.setHoist(true).catch(()=>{}); count++; }
        else await rol.setHoist(false).catch(()=>{});
        await new Promise(r=>setTimeout(r,150));
      }
      return inter.editReply(`✅ ${count} roles separados.`);
    }
    if(inter.commandName === 'rank'){
      const user = inter.options.getUser('usuario') || inter.user;
      const xp = xpData[user.id]||0;
      let nivelActual = 'Papoi'; let nextNivel = null;
      for(let i=0; i<NIVELES.length; i++){ if(xp >= NIVELES[i].xp) { nivelActual = NIVELES[i].name; nextNivel = NIVELES[i+1] || null; } }
      let msg = `⭐ **${user.username}** - ${xp} XP - **${nivelActual}**`;
      if (nextNivel) msg += `\nPróximo: **${nextNivel.name}** a ${nextNivel.xp} XP (${nextNivel.xp - xp} faltan)`;
      return inter.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }
    if(inter.commandName === 'test-bienvenida'){
      const bienvenida = findChannel(inter.guild, CONFIG.channels.bienvenida);
      const pingCanal = findChannel(inter.guild, CONFIG.channels.pingRoles);
      if(!bienvenida) return inter.reply({ content: '❌ No canal bienvenida', flags: MessageFlags.Ephemeral });
      const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(`👋 Bienvenido ${inter.user.username} a Los Papois`).setDescription(`Ya eres **Papoi**!\n\n📜 Lee las reglas\n💬 Preséntate en general\n⭐ Sube de nivel hablando\n\n🔔 **ACTIVA TUS NOTIFICACIONES:** Ve a ${pingCanal? `<#${pingCanal.id}>` : '#🔗│ping-roles'} y dale a ⚙ Configurar`).setThumbnail(inter.user.displayAvatarURL()).setTimestamp();
      await bienvenida.send({ content: `${inter.user}`, embeds: [embed] }).catch(()=>{});
      return inter.reply({ content: `✅ Enviado a ${bienvenida}`, flags: MessageFlags.Ephemeral });
    }
    
    if(inter.commandName === 'live'){
      const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
      const canalLive = findChannel(inter.guild, CONFIG.channels.live);
      if(!canalLive) return inter.reply({ content: '❌ No canal live', flags: MessageFlags.Ephemeral });
      await canalLive.send({ content: `🔴 **@everyone ELCRIS ESTÁ EN VIVO EN TIKTOK!**\nhttps://www.tiktok.com/@${tiktokUser}/live` }).catch(()=>{});
      return inter.reply({ content: `✅ LIVE en ${canalLive}`, flags: MessageFlags.Ephemeral });
    }
    if(inter.commandName === 'video'){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      const url = inter.options.getString('url');
      const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
      let videoId = url.match(/\/video\/(\d+)/)?.[1] || Date.now().toString();
      if(url.includes('vt.tiktok.com')){
        try{ const res = await axios.get(url, { maxRedirects: 5, timeout: 10000 }); const finalUrl = res.request?.res?.responseUrl || url; videoId = finalUrl.match(/\/video\/(\d+)/)?.[1] || videoId; }catch{}
      }
      const details = await getVideoDetails(videoId, tiktokUser, url);
      await sendViralVideoAnnouncement(inter.guild, details);
      return inter.editReply({ content: `✅ Video cover: ${details.cover ? 'SI' : 'NO'} - ${details.title.slice(0,50)}` });
    }
        if(inter.commandName === 'ban'){
      const user = inter.options.getUser('usuario'); const razon = inter.options.getString('razon')||'Sin razón';
      const member = inter.guild.members.cache.get(user.id);
      if(member &&!member.bannable) return inter.reply({ content: '❌ No puedo banearlo, rol más alto que yo.', flags: MessageFlags.Ephemeral });
      try { await inter.guild.members.ban(user.id, { reason: razon }); await logSancion(inter.guild, { tipo: 'BAN', moderador: inter.user, usuario: user, razon }); return inter.reply({ content: `🔨 ${user.tag} baneado - ${razon}` }); }
      catch (e) { return inter.reply({ content: `❌ Error ban: ${e.message}`, flags: MessageFlags.Ephemeral }); }
    }
    if(inter.commandName === 'kick'){ const member = inter.options.getMember('usuario'); const razon = inter.options.getString('razon')||'Sin razón'; if(!member) return inter.reply({ content: '❌ No está en el server', flags: MessageFlags.Ephemeral }); if(!member.kickable) return inter.reply({ content: '❌ No puedo kickearlo, tiene rol más alto que yo o es owner.', flags: MessageFlags.Ephemeral }); try{ await member.kick(razon); await logSancion(inter.guild, { tipo: 'KICK', moderador: inter.user, usuario: member.user, razon }); return inter.reply({ content: `👢 ${member.user.tag} kickeado` }); }catch(e){ return inter.reply({ content: `❌ Error kick: ${e.message}`, flags: MessageFlags.Ephemeral }); } }
    if(inter.commandName === 'mute'){ const member = inter.options.getMember('usuario'); if(!member) return inter.reply({ content: '❌ No está', flags: MessageFlags.Ephemeral }); if(!member.moderatable) return inter.reply({ content: '❌ No puedo mutearlo, rol más alto que yo.', flags: MessageFlags.Ephemeral }); const mins = inter.options.getInteger('minutos'); const razon = inter.options.getString('razon')||'Sin razón'; try{ await member.timeout(mins*60*1000, razon); await logSancion(inter.guild, { tipo: 'MUTE', moderador: inter.user, usuario: member.user, razon, duracion: `${mins} minutos` }); return inter.reply({ content: `🔇 ${member.user.tag} ${mins}m` }); }catch(e){ return inter.reply({ content: `❌ Error mute: ${e.message}`, flags: MessageFlags.Ephemeral }); } }
    if(inter.commandName === 'unmute'){ const member = inter.options.getMember('usuario'); if(!member) return inter.reply({ content: '❌ No está', flags: MessageFlags.Ephemeral }); if(!member.moderatable) return inter.reply({ content: '❌ No puedo desmutearlo.', flags: MessageFlags.Ephemeral }); try{ await member.timeout(null); await logSancion(inter.guild, { tipo: 'UNMUTE', moderador: inter.user, usuario: member.user, razon: 'Desmuteado' }); return inter.reply({ content: `🔊 ${member.user.tag} desmuteado` }); }catch(e){ return inter.reply({ content: `❌ Error: ${e.message}`, flags: MessageFlags.Ephemeral }); } }
    if(inter.commandName === 'warn'){ const user = inter.options.getUser('usuario'); const razon = inter.options.getString('razon'); const canal = findChannel(inter.guild, CONFIG.channels.general); if(canal) canal.send({ content: `⚠ ${user} advertencia: ${razon}` }).catch(()=>{}); await logSancion(inter.guild, { tipo: 'WARN', moderador: inter.user, usuario: user, razon }); return inter.reply({ content: `⚠ Warn ${user.tag}`, flags: MessageFlags.Ephemeral }); }
    if(inter.commandName === 'clear'){ 
      const cant = inter.options.getInteger('cantidad'); 
      try {
        const deleted = await inter.channel.bulkDelete(cant, true).catch(async () => {
          const msgs = await inter.channel.messages.fetch({ limit: cant }); let count = 0;
          for (const m of msgs.values()) { await m.delete().catch(()=>{}); count++; await new Promise(r=>setTimeout(r, 200)); }
          return { size: count };
        });
                await logSancion(inter.guild, { tipo: 'CLEAR', moderador: inter.user, usuario: inter.user, razon: `Borrados ${deleted?.size || cant} mensajes`, extra: `Canal: #${inter.channel.name}` }); return inter.reply({ content: `🧹 ${deleted?.size || cant} borrados`, flags: MessageFlags.Ephemeral }); 
      } catch (e) { return inter.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral }); }
    }
    if(inter.commandName === 'slowmode'){ const seg = inter.options.getInteger('segundos'); await inter.channel.setRateLimitPerUser(seg).catch(()=>{}); return inter.reply({ content: `⏳ Slowmode ${seg}s` }); }
  } catch (e) {
    console.error(`Error ${inter.commandName}:`, e);
    if (!inter.replied && !inter.deferred) await inter.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral }).catch(()=>{});
    else await inter.editReply({ content: `❌ ${e.message}` }).catch(()=>{});
  }
});

async function getVideoDetails(videoId, tiktokUser, originalUrl){
  let title = null; let cover = null;
  const videoUrl = originalUrl && originalUrl.includes('/video/') ? originalUrl : `https://www.tiktok.com/@${tiktokUser}/video/${videoId}`;
  console.log(`🔍 V6 Buscando ${videoId}...`);
  try{
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
    const res = await axios.get(oembedUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if(res.data){ if(res.data.thumbnail_url) cover = res.data.thumbnail_url; if(res.data.title) title = res.data.title; }
  }catch(e){ console.log(`oEmbed fail: ${e.message}`); }
  if(!cover){
    try{
      const tikwmUrl = `https://www.tikwm.com/api/user/posts?unique_id=${tiktokUser}&count=5`;
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(tikwmUrl)}`;
      const res = await axios.get(proxyUrl, { timeout: 15000 });
      let data = res.data; if(typeof data === 'string') try{ data = JSON.parse(data); }catch{}
      if(data?.data?.videos){ const found = data.data.videos.find(v => v.video_id === videoId) || data.data.videos[0]; if(found?.cover){ cover = found.cover; if(!title) title = found.title; } }
    }catch(e){ console.log(`TikWM fail: ${e.message}`); }
  }
  if(cover) cover = cover.replace(/&amp;/g, '&');
  return { videoId, title: title || '¡Nuevo video del Papoi Mayor!', cover, url: `https://www.tiktok.com/@${tiktokUser}/video/${videoId}`, originalUrl: originalUrl || `https://www.tiktok.com/@${tiktokUser}/video/${videoId}` };
}

async function sendViralVideoAnnouncement(guild, videoDetails){
  const canalClips = findChannel(guild, CONFIG.channels.clips);
  if(!canalClips) return;
  const frasesCTA = ['SOY PAPOI VERIFICADO ✅','W PAPOI MAYOR 🔥','YO VENGO DEL DISCORD 🥚','PAPOI POWER 💛','SOY DEL IMPERIO PAPOI 👑','PAPOI DE CORA ❤️','PAPOI LEGEND 🌟','AQUÍ UN PAPOI 🙋‍♂️'];
  const fraseElegida = frasesCTA[Math.floor(Math.random() * frasesCTA.length)];
  let tituloLimpio = videoDetails.title.replace(/TikTok video #\d+/i, '').trim();
  if(tituloLimpio.length > 90) tituloLimpio = tituloLimpio.slice(0, 90) + '...';
  if(!tituloLimpio || tituloLimpio.length < 5) tituloLimpio = '¡Nuevo video del Papoi Mayor!';
  const embed = new EmbedBuilder().setColor(0xFFD700).setAuthor({ name: '👑 PAPOI MAYOR HA SUBIDO VIDEO NUEVO', iconURL: guild.iconURL() || client.user.displayAvatarURL() }).setTitle(`🔥 ${tituloLimpio}`).setDescription(`¡Nuevo video ya está en TikTok! 🥚✨\n\n**Papoi Mayor les agradece de corazón** 🙏💛\nCada **comentario, like y guardado** ayuda a que se haga viral.\n\nSi lo viste desde el **Discord oficial**, comenta:\n**\`${fraseElegida}\`**\n\n> Les doy **cora ❤️** a todos\n\nGracias familia Papoi 👑\n`).setThumbnail(guild.iconURL() || client.user.displayAvatarURL()).setFooter({ text: `Papois Empire • ${fraseElegida} • ${new Date().toLocaleDateString('es-MX')}` }).setTimestamp().setURL(videoDetails.url);
  if(videoDetails.cover?.startsWith('https://')) embed.setImage(videoDetails.cover);
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('🔥 Ver en TikTok').setStyle(ButtonStyle.Link).setURL(videoDetails.originalUrl));
  await canalClips.send({ content: `@everyone 🔥 **NUEVO VIDEO DEL PAPOI MAYOR** 🔥\n${videoDetails.originalUrl}`, embeds: [embed], components: [row] }).catch(e=>console.log(e.message));
}

// --- TIKTOK AUTO-MONITOR DESHABILITADO - SOLO MANUAL /video y /live ---
async function fetchTikWMViaProxy(){ return null; }
async function scrapeTikTokDirect(){ return { videoIds: [], isLive: false }; }
async function testTikTokAPIs(){ return 'Auto-monitor deshabilitado, usa /video y /live manual'; }
async function checkTikTok(){ return; }
function startTikTokMonitor(){
  console.log('🎬 Monitor TikTok DESHABILITADO - modo manual /video y /live activo');
}

client.login(process.env.DISCORD_TOKEN);
