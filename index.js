const { Client, GatewayIntentBits, Partials, Events, REST, Routes, ChannelType, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// --- CONFIGURACIÓN ROBUSTA ---
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

// Helper para buscar canal de forma robusta (exacto primero, luego incluye)
function findChannel(guild, nameList) {
  const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
  const lowerNames = nameList.map(n => n.toLowerCase());
  // 1. Intenta exacto
  for (const name of lowerNames) {
    const exact = channels.find(c => c.name.toLowerCase() === name);
    if (exact) return exact;
  }
  // 2. Incluye
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

// --- PERSISTENCIA ROBUSTA (Fix filesystem efímero) ---
const DATA_DIR = fs.existsSync('/data') ? '/data' : './';
const XP_PATH = path.join(DATA_DIR, 'xp.json');
const TIKTOK_PATH = path.join(DATA_DIR, 'tiktok.json');

function safeLoadJSON(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ ${filePath} no existe, creando con valor por defecto`);
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.log(`❌ Error leyendo ${filePath}: ${e.message}, usando default`);
    return defaultValue;
  }
}

function safeSaveJSON(filePath, data) {
  try {
    // Escritura atómica: escribe a temp y luego renombra
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    fs.renameSync(tempPath, filePath);
  } catch (e) {
    console.log(`❌ Error guardando ${filePath}: ${e.message}`);
  }
}

let xpData = safeLoadJSON(XP_PATH, {});
let tiktokCache = safeLoadJSON(TIKTOK_PATH, { lastVideoId: null, isLiveNow: false });

const saveXP = () => safeSaveJSON(XP_PATH, xpData);
const saveTikTok = () => safeSaveJSON(TIKTOK_PATH, tiktokCache);

const lastXP = new Map();
const commandCooldown = new Map(); // Cooldown para @everyone spam

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
  const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
  console.log(`✅ BotPapoi2026 V5 SIN ERRORES ONLINE ${client.user.tag} | @${tiktokUser}`);
  console.log(`📁 Data dir: ${DATA_DIR} | XP: ${XP_PATH} | TikTok: ${TIKTOK_PATH}`);
  
  // Validación ENV
  if (!process.env.DISCORD_TOKEN) console.error('❌ FALTA DISCORD_TOKEN en .env');
  if (!process.env.GUILD_ID) console.error('❌ FALTA GUILD_ID en .env');
  if (!process.env.OWNER_ID) console.warn('⚠️ OWNER_ID no definido, solo funcionará con roles');
  
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
      { name: 'crear-canal-ping-roles', description: 'Crea SOLO el canal #🔗 | ping-roles en la categoría ROBA UN HUEVO', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'test-bienvenida', description: 'Probar mensaje de bienvenida', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'test-tiktok', description: 'Probar conexión con TikTok V4', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'live', description: 'Anunciar LIVE', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
      { name: 'video', description: 'Anunciar video con aura', options: [{ name: 'url', description: 'Link del video TikTok', type: 3, required: true }], default_member_permissions: PermissionFlagsBits.Administrator.toString() },
    ]});
    console.log('✅ Comandos V5 registrados');
  } catch (e) {
    console.error('❌ Error registrando comandos:', e.message);
  }

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if(guild){
    const general = findChannel(guild, CONFIG.channels.general);
    if(general) {
      await general.setRateLimitPerUser(10).catch(()=>{});
      console.log(`✅ Slowmode 10s aplicado a #${general.name}`);
    } else {
      console.log('⚠️ No se encontró canal #general para slowmode');
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
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`👋 Bienvenido ${member.user.username} a Los Papois`)
        .setDescription(`Ya eres **Papoi**!\n\n📜 Lee las reglas\n💬 Preséntate en general\n⭐ Sube de nivel hablando.`)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      await bienvenida.send({ content: `${member}`, embeds: [embed] }).catch(()=>{});
    }
  } catch (e) {
    console.log(`Error bienvenida ${member.user.tag}: ${e.message}`);
  }
});

// --- SOLO PAPOI MAYOR PUEDE REACCIONAR (V5 robusto) ---
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
    
    // Verifica que el bot tenga permiso
    const botMember = guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
      console.log('⚠️ Bot sin permiso ManageMessages para borrar reacciones');
      return;
    }
    
    await reaction.users.remove(user.id).catch((e)=>{ console.log(`No se pudo borrar reacción: ${e.message}`); });
    console.log(`🚫 Reacción de ${user.tag} borrada - solo Papoi Mayor puede reaccionar`);
  }catch(e){
    console.log(`Error quitando reacción: ${e.message}`);
  }
});

client.on(Events.MessageCreate, async msg => {
  if(!msg.guild || msg.author.bot) return;
  const member = msg.member;
  if(!member) return;
  
  // Anti-multimedia fuera de multimedia
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
  
  // Anti-links
  if(!isMod(member)){
    const tieneLink = /(https?:\/\/|www\.|discord\.gg|discord\.com\/invite|t\.me\/)/i.test(msg.content);
    if(tieneLink){
      await msg.delete().catch(()=>{});
      const warn = await msg.channel.send({ content: `${msg.author} ❌ Links bloqueados.` }).catch(()=>{});
      if(warn) setTimeout(()=>warn.delete().catch(()=>{}), 4000);
      return;
    }
  }
  
  // XP con cooldown
  const ahora = Date.now();
  const ultimo = lastXP.get(msg.author.id) || 0;
  if(ahora - ultimo > 60000){
    const gana = Math.floor(Math.random()*11)+15;
    xpData[msg.author.id] = (xpData[msg.author.id]||0) + gana;
    lastXP.set(msg.author.id, ahora);
    saveXP();
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
  const embed = new EmbedBuilder()
    .setColor(0x00f2ea)
    .setTitle('🔗 | ping-roles — ¡Elige tus avisos!')
    .setDescription(`**¡Bienvenido a Ping Roles!** 👋\n\nElige exactamente qué pets quieres que te avise.\n\n🍀 Secreto — 14 pets\n🚀 Eterno — 10 pets\n💎 Divino — 5 ULTRA raros`)
    .setThumbnail(guild.iconURL() || client.user.displayAvatarURL())
    .setTimestamp();
    
  const rowSecreto = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('pets_Secreto').setPlaceholder('🍀 Huevo Secreto').setMinValues(1).setMaxValues(Math.min(PETS['Secreto'].length, 25)).addOptions(PETS['Secreto'].map(p => ({ label: p, value: p, emoji: '🍀' }))));
  const rowEterno = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('pets_Eterno').setPlaceholder('🚀 Huevo Eterno').setMinValues(1).setMaxValues(Math.min(PETS['Eterno'].length, 25)).addOptions(PETS['Eterno'].map(p => ({ label: p, value: p, emoji: '🚀' }))));
  const rowDivino = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('pets_Divino').setPlaceholder('💎 Huevo Divino').setMinValues(1).setMaxValues(Math.min(PETS['Divino'].length, 25)).addOptions(PETS['Divino'].map(p => ({ label: p, value: p, emoji: '💎' }))));
  const rowBotones = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_my_pings').setLabel('📋 Mis Pings').setStyle(ButtonStyle.Secondary));
  await channel.send({ embeds: [embed], components: [rowSecreto, rowEterno, rowDivino, rowBotones] });
}

client.on(Events.InteractionCreate, async inter => {
  try {
    if(inter.isButton()){
      if(inter.customId === 'btn_my_pings'){
        await inter.deferReply({ flags: MessageFlags.Ephemeral });
        const rolesPet = inter.member.roles.cache.filter(r => ALL_PETS.some(p => p.toLowerCase() === r.name.toLowerCase())).map(r => r.name);
        if(!rolesPet.length) return inter.editReply({ content: '📭 No tienes pings activos. Ve a #🔗 | ping-roles y elige.' });
        return inter.editReply({ content: `📋 Tus pings (${rolesPet.length}): ${rolesPet.join(', ')}` });
      }
    }
    if(inter.isStringSelectMenu()){
      if(inter.customId.startsWith('pets_')){
        await inter.deferReply({ flags: MessageFlags.Ephemeral });
        const seleccionados = inter.values;
        let agregados = []; let quitados = [];
        for(const petName of seleccionados){
          const rol = findRole(inter.guild, petName);
          if(!rol) {
            console.log(`Rol no encontrado: ${petName}`);
            continue;
          }
          if(inter.member.roles.cache.has(rol.id)){ 
            await inter.member.roles.remove(rol).catch(()=>{}); 
            quitados.push(petName); 
          } else { 
            await inter.member.roles.add(rol).catch(()=>{}); 
            agregados.push(petName); 
          }
        }
        let msg = ``;
        if(agregados.length) msg += `✅ Ahora te avisará de: **${agregados.join(', ')}**\n`;
        if(quitados.length) msg += `❌ Ya NO te avisará de: **${quitados.join(', ')}**\n`;
        return inter.editReply({ content: msg || 'Hecho' });
      }
    }
    if(!inter.isChatInputCommand()) return;
    
    // Cooldown para comandos con @everyone
    if (['live', 'video'].includes(inter.commandName)) {
      const remaining = checkCooldown(inter.user.id, inter.commandName, 30);
      if (remaining > 0) {
        return inter.reply({ content: `⏳ Espera ${remaining}s para usar /${inter.commandName} de nuevo (anti-spam @everyone)`, flags: MessageFlags.Ephemeral });
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
      if(!categoria) return inter.editReply({ content: '❌ No encontré categoría ROBA UN HUEVO. Créala primero.' });
      
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
      return inter.editReply({ content: `✅ Canal reparado: ${canal}` });
    }
    if(!isMod(inter.member) &&!['rank','separar-papois-exacto','mis-pings'].includes(inter.commandName)){
      if(['setup-pets','crear-canal-ping-roles','test-bienvenida','test-tiktok','live','video'].includes(inter.commandName)){
        if(!inter.memberPermissions.has(PermissionFlagsBits.Administrator) && !isMod(inter.member)){ 
          return inter.reply({ content: '❌ Solo Moderador / Papoi Mayor', flags: MessageFlags.Ephemeral }); 
        }
      } else { 
        return inter.reply({ content: '❌ Solo Moderador / Papoi Mayor', flags: MessageFlags.Ephemeral }); 
      }
    }
    if(inter.commandName === 'setup-pets'){ 
      await inter.deferReply({ flags: MessageFlags.Ephemeral }); 
      await crearPanelPingRoles(inter.channel); 
      return inter.editReply({ content: '✅ Panel creado en este canal.' }); 
    }
    if(inter.commandName === 'separar-papois-exacto'){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      let count = 0;
      for(const [id, rol] of inter.guild.roles.cache){
        if(rol.name === '@everyone' || rol.managed) continue;
        if(SOLO_HOIST.includes(rol.name.toLowerCase())) {
          await rol.setHoist(true).catch(()=>{});
          count++;
        } else {
          await rol.setHoist(false).catch(()=>{});
        }
        await new Promise(r=>setTimeout(r,150));
      }
      return inter.editReply(`✅ ${count} roles Papois separados correctamente.`);
    }
    if(inter.commandName === 'rank'){
      const user = inter.options.getUser('usuario') || inter.user;
      const xp = xpData[user.id]||0;
      let nivelActual = 'Papoi';
      let nextNivel = null;
      for(let i=0; i<NIVELES.length; i++){
        if(xp >= NIVELES[i].xp) {
          nivelActual = NIVELES[i].name;
          nextNivel = NIVELES[i+1] || null;
        }
      }
      let msg = `⭐ **${user.username}** - ${xp} XP - Nivel: **${nivelActual}**`;
      if (nextNivel) msg += `\nPróximo: **${nextNivel.name}** a ${nextNivel.xp} XP (${nextNivel.xp - xp} faltan)`;
      return inter.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }
    if(inter.commandName === 'test-bienvenida'){
      const bienvenida = findChannel(inter.guild, CONFIG.channels.bienvenida);
      if(!bienvenida) return inter.reply({ content: '❌ No encontré canal bienvenida', flags: MessageFlags.Ephemeral });
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`👋 Bienvenido ${inter.user.username} a Los Papois`)
        .setDescription(`Ya eres **Papoi**!`)
        .setThumbnail(inter.user.displayAvatarURL())
        .setTimestamp();
      await bienvenida.send({ content: `${inter.user}`, embeds: [embed] }).catch(()=>{});
      return inter.reply({ content: `✅ Prueba enviada a ${bienvenida}`, flags: MessageFlags.Ephemeral });
    }
    if(inter.commandName === 'test-tiktok'){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await testTikTokAPIs();
      return inter.editReply({ content: result.slice(0,1900) });
    }
    if(inter.commandName === 'live'){
      const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
      const canalLive = findChannel(inter.guild, CONFIG.channels.live);
      if(!canalLive) return inter.reply({ content: '❌ No encontré canal #elcris-en-vivo', flags: MessageFlags.Ephemeral });
      await canalLive.send({ content: `🔴 **@everyone ELCRIS ESTÁ EN VIVO EN TIKTOK!**\nhttps://www.tiktok.com/@${tiktokUser}/live\n¡Vayan a apoyar!` }).catch((e)=>{ console.log(`Error live: ${e.message}`); });
      return inter.reply({ content: `✅ Anuncio LIVE enviado a ${canalLive} con @everyone`, flags: MessageFlags.Ephemeral });
    }
    if(inter.commandName === 'video'){
      await inter.deferReply({ flags: MessageFlags.Ephemeral });
      const url = inter.options.getString('url');
      const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
      let videoId = url.match(/\/video\/(\d+)/)?.[1] || Date.now().toString();
      if(url.includes('vt.tiktok.com')){
        try{
          const res = await axios.get(url, { maxRedirects: 5, timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
          const finalUrl = res.request?.res?.responseUrl || url;
          videoId = finalUrl.match(/\/video\/(\d+)/)?.[1] || videoId;
        }catch{}
      }
      const details = await getVideoDetails(videoId, tiktokUser, url);
      await sendViralVideoAnnouncement(inter.guild, details);
      return inter.editReply({ content: `✅ Video anunciado con @everyone - cover: ${details.cover ? 'SI' : 'NO'} - Título: ${details.title.slice(0,50)}` });
    }
    // FIX: ban/kick con manejo de usuarios fuera del server
    if(inter.commandName === 'ban'){ 
      const user = inter.options.getUser('usuario'); 
      const razon = inter.options.getString('razon')||'Sin razón'; 
      try {
        await inter.guild.members.ban(user.id, { reason: razon });
        return inter.reply({ content: `🔨 Baneado ${user.tag} - ${razon}` }); 
      } catch (e) {
        return inter.reply({ content: `❌ No pude banear ${user.tag}: ${e.message}`, flags: MessageFlags.Ephemeral });
      }
    }
    if(inter.commandName === 'kick'){ 
      const member = inter.options.getMember('usuario'); 
      const razon = inter.options.getString('razon')||'Sin razón'; 
      if(!member) return inter.reply({ content: '❌ Usuario no está en el servidor', flags: MessageFlags.Ephemeral });
      await member.kick(razon).catch(()=>{}); 
      return inter.reply({ content: `👢 Kick a ${member.user.tag}` }); 
    }
    if(inter.commandName === 'mute'){ 
      const member = inter.options.getMember('usuario'); 
      if(!member) return inter.reply({ content: '❌ Usuario no está en el servidor', flags: MessageFlags.Ephemeral });
      const mins = inter.options.getInteger('minutos'); 
      const razon = inter.options.getString('razon')||'Silenciado'; 
      await member.timeout(mins*60*1000, razon).catch(()=>{}); 
      return inter.reply({ content: `🔇 ${member.user.tag} muteado ${mins}m` }); 
    }
    if(inter.commandName === 'unmute'){ 
      const member = inter.options.getMember('usuario'); 
      if(!member) return inter.reply({ content: '❌ Usuario no está en el servidor', flags: MessageFlags.Ephemeral });
      await member.timeout(null).catch(()=>{}); 
      return inter.reply({ content: `🔊 ${member.user.tag} desmuteado` }); 
    }
    if(inter.commandName === 'warn'){ 
      const user = inter.options.getUser('usuario'); 
      const razon = inter.options.getString('razon'); 
      const canal = findChannel(inter.guild, CONFIG.channels.general);
      if(canal) canal.send({ content: `⚠ ${user} advertencia: ${razon}` }).catch(()=>{}); 
      return inter.reply({ content: `⚠ Warn a ${user.tag}`, flags: MessageFlags.Ephemeral }); 
    }
    if(inter.commandName === 'clear'){ 
      const cant = inter.options.getInteger('cantidad'); 
      try {
        const deleted = await inter.channel.bulkDelete(cant, true).catch(async () => {
          // Fallback si son mensajes viejos >14 días
          const msgs = await inter.channel.messages.fetch({ limit: cant });
          let count = 0;
          for (const m of msgs.values()) {
            await m.delete().catch(()=>{});
            count++;
            await new Promise(r=>setTimeout(r, 200));
          }
          return { size: count };
        });
        return inter.reply({ content: `🧹 Borrados ${deleted?.size || cant} mensajes`, flags: MessageFlags.Ephemeral }); 
      } catch (e) {
        return inter.reply({ content: `❌ Error borrando: ${e.message}`, flags: MessageFlags.Ephemeral });
      }
    }
    if(inter.commandName === 'slowmode'){ 
      const seg = inter.options.getInteger('segundos'); 
      await inter.channel.setRateLimitPerUser(seg).catch((e)=>{ console.log(e.message); }); 
      return inter.reply({ content: `⏳ Slowmode puesto a ${seg}s en este canal` }); 
    }
  } catch (e) {
    console.error(`Error en interacción ${inter.commandName}:`, e);
    if (!inter.replied && !inter.deferred) {
      await inter.reply({ content: `❌ Error: ${e.message}`, flags: MessageFlags.Ephemeral }).catch(()=>{});
    } else {
      await inter.editReply({ content: `❌ Error: ${e.message}` }).catch(()=>{});
    }
  }
});

// --- FUNCIONES TIKTOK V5 ROBUSTAS ---

async function getVideoDetails(videoId, tiktokUser, originalUrl){
  let title = null;
  let cover = null;
  const videoUrl = originalUrl && originalUrl.includes('/video/') ? originalUrl : `https://www.tiktok.com/@${tiktokUser}/video/${videoId}`;
  console.log(`🔍 V5 Buscando detalles para ${videoId}...`);
  
  // 1. oEmbed oficial (más estable)
  try{
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
    console.log(`🔄 Probando oEmbed: ${oembedUrl}`);
    const res = await axios.get(oembedUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    if(res.data){
      if(res.data.thumbnail_url){ 
        cover = res.data.thumbnail_url; 
        console.log(`✅ oEmbed COVER SI: ${cover.slice(0,80)}...`); 
      }
      if(res.data.title){ 
        title = res.data.title; 
        console.log(`✅ oEmbed TITLE: ${title.slice(0,50)}...`); 
      }
    }
  }catch(e){ console.log(`❌ oEmbed fail: ${e.response?.status || e.message}`); }

  // 2. Fallback TikWM proxy
  if(!cover){
    try{
      const tikwmUrl = `https://www.tikwm.com/api/user/posts?unique_id=${tiktokUser}&count=5`;
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(tikwmUrl)}`;
      const res = await axios.get(proxyUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      let data = res.data;
      if(typeof data === 'string'){ try{ data = JSON.parse(data); }catch{} }
      if(data && data.data && data.data.videos){
        const found = data.data.videos.find(v => v.video_id === videoId) || data.data.videos[0];
        if(found && found.cover){ 
          cover = found.cover; 
          if(!title) title = found.title; 
          console.log(`✅ TikWM proxy COVER SI`); 
        }
      }
    }catch(e){ console.log(`TikWM proxy fail V5: ${e.message}`); }
  }

  if(cover) cover = cover.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

  return {
    videoId,
    title: title || '¡Nuevo video del Papoi Mayor!',
    cover: cover,
    url: `https://www.tiktok.com/@${tiktokUser}/video/${videoId}`,
    originalUrl: originalUrl || `https://www.tiktok.com/@${tiktokUser}/video/${videoId}`
  };
}

async function sendViralVideoAnnouncement(guild, videoDetails){
  const canalClips = findChannel(guild, CONFIG.channels.clips);
  if(!canalClips){ 
    console.log('❌ No encontré canal clips-tiktok, revisa CONFIG.channels.clips'); 
    return; 
  }

  const frasesCTA = [
    'SOY PAPOI VERIFICADO ✅',
    'W PAPOI MAYOR 🔥',
    'YO VENGO DEL DISCORD 🥚',
    'PAPOI POWER 💛',
    'SOY DEL IMPERIO PAPOI 👑',
    'PAPOI DE CORA ❤️',
    'PAPOI LEGEND 🌟',
    'AQUÍ UN PAPOI 🙋‍♂️',
  ];
  const fraseElegida = frasesCTA[Math.floor(Math.random() * frasesCTA.length)];

  let tituloLimpio = videoDetails.title.replace(/TikTok video #\d+/i, '').trim();
  if(tituloLimpio.length > 90) tituloLimpio = tituloLimpio.slice(0, 90) + '...';
  if(!tituloLimpio || tituloLimpio.length < 5) tituloLimpio = '¡Nuevo video del Papoi Mayor!';

  console.log(`📢 Anunciando video ${videoDetails.videoId} con cover: ${videoDetails.cover ? 'SI' : 'NO'}`);

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setAuthor({ name: '👑 PAPOI MAYOR HA SUBIDO VIDEO NUEVO', iconURL: guild.iconURL() || client.user.displayAvatarURL() })
    .setTitle(`🔥 ${tituloLimpio}`)
    .setDescription(
      `¡Nuevo video ya está en TikTok! 🥚✨\n\n`+
      `**Papoi Mayor les agradece de corazón** por todo el apoyo que le dan al video 🙏💛\n`+
      `Cada **comentario, like y guardado** ayuda un montón a que llegue a más Papois y se haga viral.\n\n`+
      `Si lo viste desde el **Discord oficial**, pásate a TikTok y comenta:\n`+
      `**\`${fraseElegida}\`**\n\n`+
      `> A todos los que comenten les doy **cora ❤️**\n\n`+
      `Gracias familia Papoi por el apoyo siempre 👑\n`
    )
    .setThumbnail(guild.iconURL() || client.user.displayAvatarURL())
    .setFooter({ text: `Papois Empire • Comenta "${fraseElegida}" • ${new Date().toLocaleDateString('es-MX')}` })
    .setTimestamp()
    .setURL(videoDetails.url);

  if(videoDetails.cover && videoDetails.cover.startsWith('https://')){
    embed.setImage(videoDetails.cover);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('🔥 Ver en TikTok').setStyle(ButtonStyle.Link).setURL(videoDetails.originalUrl),
  );

  const content = `@everyone 🔥 **NUEVO VIDEO DEL PAPOI MAYOR** 🔥\n${videoDetails.originalUrl}`;

  await canalClips.send({ 
    content: content,
    embeds: [embed],
    components: [row]
  }).catch(e=>console.log('Error anuncio:', e.message));

  console.log(`✅ Anuncio V5 enviado con cover: ${videoDetails.cover ? 'SI' : 'NO'}`);
}

async function fetchTikWMViaProxy(tiktokUser){
  const tikwmUrl = `https://www.tikwm.com/api/user/posts?unique_id=${tiktokUser}&count=3`;
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(tikwmUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(tikwmUrl)}`,
  ];
  for(const proxyUrl of proxies){
    try{
      const res = await axios.get(proxyUrl, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      let data = res.data;
      if(typeof data === 'string'){ try{ data = JSON.parse(data); }catch{} }
      if(data && data.data && data.data.videos && data.data.videos[0]) return data;
    }catch(e){ console.log(`Proxy TikWM fail: ${e.message}`); }
  }
  return null;
}

async function scrapeTikTokDirect(tiktokUser){
  try{
    const res = await axios.get(`https://www.tiktok.com/@${tiktokUser}`, {
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'en-US,en;q=0.9,es;q=0.8' }
    });
    const html = res.data;
    const regex = /\/video\/(\d{18,20})/g;
    let ids = []; let m;
    while((m = regex.exec(html)) !== null) ids.push(m[1]);
    ids = [...new Set(ids)];
    const isLive = html.includes('"isLive":true') || html.includes('"is_live":true');
    return { videoIds: ids, isLive, htmlLength: html.length };
  }catch(e){
    console.log(`Scrape fail: ${e.message}`);
    return { videoIds: [], isLive: false, htmlLength: 0 };
  }
}

async function testTikTokAPIs(){
  const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
  let result = `🧪 V5 SIN ERRORES Probando @${tiktokUser}...\n\n`;
  try{
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/@${tiktokUser}/video/7691863965617491218`)}`;
    const res = await axios.get(oembedUrl, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    result += `✅ oEmbed: cover=${res.data.thumbnail_url ? 'SI' : 'NO'} title=${res.data.title?.slice(0,30)}\n`;
  }catch(e){ result += `❌ oEmbed: ${e.response?.status || e.message}\n`; }
  try{
    const data = await fetchTikWMViaProxy(tiktokUser);
    if(data) result += `✅ Proxy TikWM: OK video=${data.data.videos[0].video_id} cover=${data.data.videos[0].cover ? 'SI' : 'NO'}\n`;
    else result += `⚠ Proxy TikWM: sin datos (normal, oEmbed es principal)\n`;
  }catch(e){ result += `❌ Proxy: ${e.message}\n`; }
  try{
    const details = await getVideoDetails('7691863965617491218', tiktokUser, `https://www.tiktok.com/@${tiktokUser}/video/7691863965617491218`);
    result += `✅ getVideoDetails V5: cover=${details.cover ? 'SI' : 'NO'} title=${details.title.slice(0,30)}\n`;
  }catch(e){ result += `❌ getVideoDetails V5: ${e.message}\n`; }
  result += `\nCache: lastVideo=${tiktokCache.lastVideoId} isLive=${tiktokCache.isLiveNow}\n`;
  result += `Data dir: ${DATA_DIR} (si es /data es persistente)\n`;
  result += `V5 con todos los fixes aplicados`;
  return result;
}

async function checkTikTok(){
  const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if(!guild) return;
  console.log(`🔍 [TikTok V5] Check @${tiktokUser}...`);
  
  let videoId = null;
  let isLiveNow = false;
  
  const proxyData = await fetchTikWMViaProxy(tiktokUser);
  if(proxyData && proxyData.data && proxyData.data.videos && proxyData.data.videos[0]){
    videoId = proxyData.data.videos[0].video_id;
  } else {
    const scrape = await scrapeTikTokDirect(tiktokUser);
    if(scrape.videoIds.length > 0) videoId = scrape.videoIds[0];
    isLiveNow = scrape.isLive;
  }
  
  // --- FIX: Detección de LIVE automática (antes no se usaba) ---
  if (isLiveNow && !tiktokCache.isLiveNow) {
    console.log('🔴 LIVE DETECTADO AUTOMÁTICAMENTE!');
    const canalLive = findChannel(guild, CONFIG.channels.live);
    if (canalLive) {
      await canalLive.send({ 
        content: `🔴 **@everyone ELCRIS ESTÁ EN VIVO EN TIKTOK!**\nhttps://www.tiktok.com/@${tiktokUser}/live\n¡Vayan a apoyar! 🔥` 
      }).catch(()=>{});
    }
    tiktokCache.isLiveNow = true;
    saveTikTok();
  } else if (!isLiveNow && tiktokCache.isLiveNow) {
    console.log('⚫ LIVE terminó');
    tiktokCache.isLiveNow = false;
    saveTikTok();
  }
  
  if(videoId){
    console.log(`📹 Video: ${videoId} vs cache ${tiktokCache.lastVideoId}`);
    if(tiktokCache.lastVideoId === null){
      tiktokCache.lastVideoId = videoId;
      saveTikTok();
      console.log('💾 Primer video guardado sin avisar (anti-spam al reiniciar)');
    } else if(videoId !== tiktokCache.lastVideoId){
      console.log('🎬 NUEVO VIDEO DETECTADO! V5...');
      tiktokCache.lastVideoId = videoId;
      saveTikTok();
      const details = await getVideoDetails(videoId, tiktokUser, `https://www.tiktok.com/@${tiktokUser}/video/${videoId}`);
      await sendViralVideoAnnouncement(guild, details);
    }
  }
}

function startTikTokMonitor(){
  const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
  console.log(`🎬 Monitor TikTok V5 SIN ERRORES iniciado @${tiktokUser} cada 90s | LIVE auto + VIDEO auto`);
  setTimeout(checkTikTok, 15000);
  setInterval(checkTikTok, 90000);
}

client.login(process.env.DISCORD_TOKEN);
