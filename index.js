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

const { Client, GatewayIntentBits, Partials, Events, REST, Routes, ChannelType, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
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
    pingRoles: ['ping-roles']
  },
  categories: {
    robaHuevo: ['roba un huevo', 'roba']
  }
};

function findChannel(guild, nameList) {
  const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
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
      console.log(`✅ TikTok cache cargado desde MongoDB: ${tiktokCache.lastVideoId}`);
      safeSaveJSON(TIKTOK_PATH, tiktokCache);
    } else if (tiktokCache.lastVideoId) {
      // Migrar
      await TikTokModel.findOneAndUpdate({ guildId }, { lastVideoId: tiktokCache.lastVideoId, isLiveNow: tiktokCache.isLiveNow }, { upsert: true });
      console.log('📤 Migrando tiktok.json a MongoDB...');
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

const NIVELES = [
  { name: 'Papoi', xp: 0 },
  { name: 'Papoi Activo', xp: 500 },
  { name: 'Papoi Fiel', xp: 1500 },
  { name: 'Papoi Veterano', xp: 5000 },
  { name: 'Papoi Leyenda', xp: 15000 },
];
const SOLO_HOIST = ['papoi mayor','moderador','booster papoi','papoi leyenda','papoi veterano','papoi fiel','papoi activo','papoi'];
const PETS = {
  'Secreto': ['RazorFang','Centaur','Gargoyle','Pure Jellyfish','Mutant Shark','Stag','Cosmic Dragon','Cosmic Skeleton Boss','Tralaledon','TRex','Kraken','Cerberus','Yeti','King Snake'],
  'Eterno': ['Skeleton Horse','Pegasus','Gorilla King','Oni Tiger','Eternal Lunar Dragon','Mosasaurus','El Maja','Lava Dragon','Phoenix','Ice Dragon'],
  'Divino': ['World Burner','ArchAngel','Nightflame','Kitsune','Unicorn']
};
const ALL_PETS = [...PETS['Secreto'], ...PETS['Eterno'], ...PETS['Divino']];

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
      { name: 'test-bienvenida', description: 'Probar mensaje de bienvenida', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'test-tiktok', description: 'Probar conexión con TikTok V6', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'live', description: 'Anunciar LIVE', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'video', description: 'Anunciar video con aura', options: [{ name: 'url', description: 'Link del video TikTok', type: 3, required: true }], default_member_permissions: PermissionFlagsBits.Administrator.toString() },
    ]});
    console.log('✅ Comandos V6 registrados');
  } catch (e) {
    console.error('❌ Error registrando comandos:', e.message);
  }

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if(guild){
    const general = findChannel(guild, CONFIG.channels.general);
    if(general) {
      await general.setRateLimitPerUser(10).catch(()=>{});
      console.log(`✅ Slowmode 10s en #${general.name}`);
    }
  }
  startTikTokMonitor();
});

client.on(Events.GuildMemberAdd, async member => {
  try {
    const guild = member.guild;
    const rolPapoi = findRole(guild, 'papoi');
    if(rolPapoi) await member.roles.add(rolPapoi).catch(()=>{});
    const bienvenida = findChannel(guild, CONFIG.channels.bienvenida);
    if(bienvenida){
      const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(`👋 Bienvenido ${member.user.username} a Los Papois`).setDescription(`Ya eres **Papoi**!\n\n📜 Lee las reglas\n💬 Preséntate en general\n⭐ Sube de nivel hablando.`).setThumbnail(member.user.displayAvatarURL()).setTimestamp();
      await bienvenida.send({ content: `${member}`, embeds: [embed] }).catch(()=>{});
    }
  } catch (e) {
    console.log(`Error bienvenida: ${e.message}`);
  }
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
    if(isPapoiMayor(member)) return;
    const botMember = guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) return;
    await reaction.users.remove(user.id).catch(()=>{});
    console.log(`🚫 Reacción de ${user.tag} borrada`);
  }catch(e){
    console.log(`Error reacción: ${e.message}`);
  }
});

client.on(Events.MessageCreate, async msg => {
  if(!msg.guild || msg.author.bot) return;
  const member = msg.member;
  if(!member) return;
  
  if(!isOwner(msg.author.id)){
    const esMultimedia = msg.channel.name.toLowerCase().includes('multimedia');
    if(!esMultimedia && msg.attachments.size > 0){
      await msg.delete().catch(()=>{});
      const canalMulti = findChannel(msg.guild, CONFIG.channels.multimedia);
      const warn = await msg.channel.send({ content: `${msg.author} ❌ Multimedia **solo** en ${canalMulti ? `<#${canalMulti.id}>` : '#multimedia'}` }).catch(()=>{});
      if(warn) setTimeout(()=>warn.delete().catch(()=>{}), 5000);
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
  }

  // --- IA PAPOI V7 CON MEMORIA + ANTI-GROSERIAS ---
  if(groq && (msg.mentions.has(client.user) || msg.content.toLowerCase().includes('papoi ia'))){
    const texto = msg.content.toLowerCase();
    if(GROSIERIAS.some(w => texto.includes(w))){
      await msg.reply({ content: `${msg.author} sin groserías papoi 🙏 somos family friendly 💛` }).then(m=>setTimeout(()=>m.delete().catch(()=>{}),5000)).catch(()=>{});
      return;
    }
    const keyAI = `ai-${msg.author.id}`;
    if(Date.now() - (aiCooldown.get(keyAI)||0) < 10000) return;
    aiCooldown.set(keyAI, Date.now());
    if(texto.includes('discord.gg')) return;
    try {
      await msg.channel.sendTyping();
      const hist = await msg.channel.messages.fetch({ limit: 6 }).catch(()=>null);
      const contexto = hist ? [...hist.values()].reverse().map(m => `${m.author.username}: ${m.content.slice(0,80)}`).join('\n') : '';
      const pregunta = msg.content.replace(/<@!?\d+>/g,'').replace(/papoi ia/gi,'').trim().slice(0,300);
      if(!pregunta) return;
      const chat = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Eres BotPapoi2026, Papoi Mayor bot, mexicano joven buena onda, dices 'papoi','w','🥚💛', max 2 lineas, nunca groserías, sabes todo de Roblox Steal a Brainrot, family friendly." },
          { role: "user", content: `Chat reciente:\n${contexto}\n\nAhora ${msg.author.username} dice: ${pregunta}` }
        ],
        max_tokens: 120,
        temperature: 0.85
      });
      const respuesta = chat.choices[0]?.message?.content || "W papoi no entendí 🥚";
      await msg.reply({ content: respuesta.slice(0,400) });
      return;
    } catch(e){ console.log(`IA fail: ${e.message}`); }
  }
  
  const ahora = Date.now();
  const ultimo = lastXP.get(msg.author.id) || 0;
  if(ahora - ultimo > 60000){
    const gana = Math.floor(Math.random()*11)+15;
    xpData[msg.author.id] = (xpData[msg.author.id]||0) + gana;
    lastXP.set(msg.author.id, ahora);
    await saveXP();
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
  const embed = new EmbedBuilder().setColor(0x00f2ea).setTitle('🔗 | ping-roles — ¡Elige tus avisos!').setDescription(`**¡Bienvenido a Ping Roles!** 👋\n\nElige exactamente qué pets quieres que te avise.\n\n🍀 Secreto — 14 pets\n🚀 Eterno — 10 pets\n💎 Divino — 5 ULTRA raros`).setThumbnail(guild.iconURL() || client.user.displayAvatarURL()).setTimestamp();
  const rowSecreto = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('pets_Secreto').setPlaceholder('🍀 Huevo Secreto').setMinValues(1).setMaxValues(Math.min(PETS['Secreto'].length, 25)).addOptions(PETS['Secreto'].map(p => ({ label: p, value: p, emoji: '🍀' }))));
  const rowEterno = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('pets_Eterno').setPlaceholder('🚀 Huevo Eterno').setMinValues(1).setMaxValues(Math.min(PETS['Eterno'].length, 25)).addOptions(PETS['Eterno'].map(p => ({ label: p, value: p, emoji: '🚀' }))));
  const rowDivino = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('pets_Divino').setPlaceholder('💎 Huevo Divino').setMinValues(1).setMaxValues(Math.min(PETS['Divino'].length, 25)).addOptions(PETS['Divino'].map(p => ({ label: p, value: p, emoji: '💎' }))));
  const rowBotones = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_my_pings').setLabel('📋 Mis Pings').setStyle(ButtonStyle.Secondary));
  await channel.send({ embeds: [embed], components: [rowSecreto, rowEterno, rowDivino, rowBotones] });
}

client.on(Events.InteractionCreate, async inter => {
  try {
    if(inter.isButton() && inter.customId === 'btn_my_pings'){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      const rolesPet = inter.member.roles.cache.filter(r => ALL_PETS.some(p => p.toLowerCase() === r.name.toLowerCase())).map(r => r.name);
      if(!rolesPet.length) return inter.editReply({ content: '📭 No tienes pings activos.' });
      return inter.editReply({ content: `📋 Tus pings (${rolesPet.length}): ${rolesPet.join(', ')}` });
    }
    if(inter.isStringSelectMenu() && inter.customId.startsWith('pets_')){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      let agregados = []; let quitados = [];
      for(const petName of inter.values){
        const rol = findRole(inter.guild, petName);
        if(!rol) continue;
        if(inter.member.roles.cache.has(rol.id)){ await inter.member.roles.remove(rol).catch(()=>{}); quitados.push(petName); }
        else { await inter.member.roles.add(rol).catch(()=>{}); agregados.push(petName); }
      }
      let msg = ``;
      if(agregados.length) msg += `✅ Ahora: **${agregados.join(', ')}**\n`;
      if(quitados.length) msg += `❌ Ya no: **${quitados.join(', ')}**\n`;
      return inter.editReply({ content: msg || 'Hecho' });
    }
    if(!inter.isChatInputCommand()) return;
    
    if (['live', 'video'].includes(inter.commandName)) {
      const remaining = checkCooldown(inter.user.id, inter.commandName, 30);
      if (remaining > 0) {
        return inter.reply({ content: `⏳ Espera ${remaining}s para /${inter.commandName}`, flags: MessageFlags.Ephemeral });
      }
    }

    if(inter.commandName === 'mis-pings'){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      const rolesPet = inter.member.roles.cache.filter(r => ALL_PETS.some(p => p.toLowerCase() === r.name.toLowerCase())).map(r => r.name);
      if(!rolesPet.length) return inter.editReply({ content: '📭 No tienes pings activos.' });
      return inter.editReply({ content: `📋 Tus pings: ${rolesPet.join(', ')}` });
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
    if(!isMod(inter.member) &&!['rank','separar-papois-exacto','mis-pings'].includes(inter.commandName)){
      if(!inter.memberPermissions.has(PermissionFlagsBits.Administrator) && !isMod(inter.member)){ 
        return inter.reply({ content: '❌ Solo Moderador / Papoi Mayor', flags: MessageFlags.Ephemeral }); 
      }
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
      if(!bienvenida) return inter.reply({ content: '❌ No canal bienvenida', flags: MessageFlags.Ephemeral });
      const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(`👋 Bienvenido ${inter.user.username}`).setDescription(`Ya eres **Papoi**!`).setThumbnail(inter.user.displayAvatarURL()).setTimestamp();
      await bienvenida.send({ content: `${inter.user}`, embeds: [embed] }).catch(()=>{});
      return inter.reply({ content: `✅ Enviado a ${bienvenida}`, flags: MessageFlags.Ephemeral });
    }
    if(inter.commandName === 'test-tiktok'){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await testTikTokAPIs();
      return inter.editReply({ content: result.slice(0,1900) });
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
      try { await inter.guild.members.ban(user.id, { reason: razon }); return inter.reply({ content: `🔨 ${user.tag} baneado - ${razon}` }); } 
      catch (e) { return inter.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral }); }
    }
    if(inter.commandName === 'kick'){ const member = inter.options.getMember('usuario'); if(!member) return inter.reply({ content: '❌ No está en el server', flags: MessageFlags.Ephemeral }); await member.kick().catch(()=>{}); return inter.reply({ content: `👢 ${member.user.tag} kickeado` }); }
    if(inter.commandName === 'mute'){ const member = inter.options.getMember('usuario'); if(!member) return inter.reply({ content: '❌ No está', flags: MessageFlags.Ephemeral }); const mins = inter.options.getInteger('minutos'); await member.timeout(mins*60*1000).catch(()=>{}); return inter.reply({ content: `🔇 ${member.user.tag} ${mins}m` }); }
    if(inter.commandName === 'unmute'){ const member = inter.options.getMember('usuario'); if(!member) return inter.reply({ content: '❌ No está', flags: MessageFlags.Ephemeral }); await member.timeout(null).catch(()=>{}); return inter.reply({ content: `🔊 ${member.user.tag} desmuteado` }); }
    if(inter.commandName === 'warn'){ const user = inter.options.getUser('usuario'); const razon = inter.options.getString('razon'); const canal = findChannel(inter.guild, CONFIG.channels.general); if(canal) canal.send({ content: `⚠ ${user} advertencia: ${razon}` }).catch(()=>{}); return inter.reply({ content: `⚠ Warn ${user.tag}`, flags: MessageFlags.Ephemeral }); }
    if(inter.commandName === 'clear'){ 
      const cant = inter.options.getInteger('cantidad'); 
      try {
        const deleted = await inter.channel.bulkDelete(cant, true).catch(async () => {
          const msgs = await inter.channel.messages.fetch({ limit: cant }); let count = 0;
          for (const m of msgs.values()) { await m.delete().catch(()=>{}); count++; await new Promise(r=>setTimeout(r, 200)); }
          return { size: count };
        });
        return inter.reply({ content: `🧹 ${deleted?.size || cant} borrados`, flags: MessageFlags.Ephemeral }); 
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

async function fetchTikWMViaProxy(tiktokUser){
  const tikwmUrl = `https://www.tikwm.com/api/user/posts?unique_id=${tiktokUser}&count=3`;

  // 1. Intenta directo sin proxy primero (a veces Railway sí deja)
  try {
    const res = await axios.get(tikwmUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if(res.data?.data?.videos?.[0]) {
      console.log(`✅ TikWM directo OK: ${res.data.data.videos[0].video_id}`);
      return res.data;
    }
  } catch(e){ console.log(`Direct fail: ${e.message}`); }

  // 2. Prueba con 5 proxies diferentes
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(tikwmUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(tikwmUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(tikwmUrl)}`,
    `https://thingproxy.freeboard.name/fetch/${tikwmUrl}`,
    `https://proxy.cors.sh/${tikwmUrl}`
  ];
  for(const proxyUrl of proxies){
    try{ const res = await axios.get(proxyUrl, { timeout: 20000 }); let data = res.data; if(typeof data === 'string') try{ data = JSON.parse(data); }catch{} if(data?.data?.videos?.[0]) return data; }catch(e){ console.log(`Proxy fail: ${e.message}`); }
  }
  return null;
}

async function scrapeTikTokDirect(tiktokUser){
  try{
    const res = await axios.get(`https://www.tiktok.com/@${tiktokUser}`, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' } });
    const html = res.data; const regex = /\/video\/(\d{18,20})/g; let ids = []; let m; while((m = regex.exec(html)) !== null) ids.push(m[1]); ids = [...new Set(ids)];
    const isLive = html.includes('"isLive":true') || html.includes('"is_live":true');
    return { videoIds: ids, isLive, htmlLength: html.length };
  }catch(e){ return { videoIds: [], isLive: false, htmlLength: 0 }; }
}

async function testTikTokAPIs(){
  const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
  let result = `🧪 V6 100% PERFECTO @${tiktokUser}...\n\nMongo: ${useMongo ? 'ACTIVO ✅' : 'Archivos (pon MONGO_URI)'}\n`;
  try{ const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/@${tiktokUser}/video/7691863965617491218`)}`; const res = await axios.get(oembedUrl, { timeout: 10000 }); result += `✅ oEmbed: cover=${res.data.thumbnail_url ? 'SI' : 'NO'}\n`; }catch(e){ result += `❌ oEmbed: ${e.message}\n`; }
  result += `Cache: ${tiktokCache.lastVideoId} Live:${tiktokCache.isLiveNow}\nData: ${DATA_DIR}\n`;
  return result;
}

async function checkTikTok(){
  const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if(!guild) return;
  console.log(`🔍 [V6] Check @${tiktokUser}...`);
  let videoId = null; let isLiveNow = false;
  const proxyData = await fetchTikWMViaProxy(tiktokUser);
  if(proxyData?.data?.videos?.[0]) videoId = proxyData.data.videos[0].video_id;
  else { const scrape = await scrapeTikTokDirect(tiktokUser); if(scrape.videoIds.length > 0) videoId = scrape.videoIds[0]; isLiveNow = scrape.isLive; }
  
  if (isLiveNow && !tiktokCache.isLiveNow) {
    const canalLive = findChannel(guild, CONFIG.channels.live);
    if (canalLive) await canalLive.send({ content: `🔴 **@everyone ELCRIS EN VIVO!**\nhttps://www.tiktok.com/@${tiktokUser}/live 🔥` }).catch(()=>{});
    tiktokCache.isLiveNow = true; await saveTikTok();
  } else if (!isLiveNow && tiktokCache.isLiveNow) {
    tiktokCache.isLiveNow = false; await saveTikTok();
  }
  
  if(videoId){
    if(tiktokCache.lastVideoId === null){ tiktokCache.lastVideoId = videoId; await saveTikTok(); }
    else if(videoId !== tiktokCache.lastVideoId){
      tiktokCache.lastVideoId = videoId; await saveTikTok();
      const details = await getVideoDetails(videoId, tiktokUser, `https://www.tiktok.com/@${tiktokUser}/video/${videoId}`);
      await sendViralVideoAnnouncement(guild, details);
    }
  }
}

function startTikTokMonitor(){
  console.log(`🎬 Monitor V6 iniciado cada 90s | Mongo: ${useMongo ? 'SI' : 'NO (usa archivos)'}`);
  setTimeout(checkTikTok, 15000);
  setInterval(checkTikTok, 90000);
}

client.login(process.env.DISCORD_TOKEN);
