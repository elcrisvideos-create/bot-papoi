const { Client, GatewayIntentBits, Partials, Events, REST, Routes, ChannelType, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const axios = require('axios');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message]
});

let xpData = {};
try { xpData = JSON.parse(fs.readFileSync('./xp.json','utf8')); } catch { xpData = {}; }
const saveXP = () => fs.writeFileSync('./xp.json', JSON.stringify(xpData, null, 2));
const lastXP = new Map();

let tiktokCache = {};
try { tiktokCache = JSON.parse(fs.readFileSync('./tiktok.json','utf8')); } catch { tiktokCache = { lastVideoId: null, isLiveNow: false }; }
const saveTikTok = () => fs.writeFileSync('./tiktok.json', JSON.stringify(tiktokCache, null, 2));

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

client.on(Events.ClientReady, async () => {
  const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
  console.log(`✅ BotPapoi2026 ONLINE ${client.user.tag} | TikTok @${tiktokUser}`);
  const rest = new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: [
    { name: 'separar-papois-exacto', description: 'Separa solo los 8 roles de Papois' },
    { name: 'rank', description: 'Ver tu XP y nivel', options: [{ name: 'usuario', description: 'Usuario a consultar', type: 6, required: false }] },
    { name: 'ban', description: 'Banear usuario', options: [{ name: 'usuario', description: 'Usuario a banear', type: 6, required: true }, { name: 'razon', description: 'Razón', type: 3, required: false }], default_member_permissions: PermissionFlagsBits.BanMembers.toString() },
    { name: 'kick', description: 'Expulsar usuario', options: [{ name: 'usuario', description: 'Usuario a expulsar', type: 6, required: true }, { name: 'razon', description: 'Razón', type: 3, required: false }], default_member_permissions: PermissionFlagsBits.KickMembers.toString() },
    { name: 'mute', description: 'Silenciar temporalmente', options: [{ name: 'usuario', description: 'Usuario a silenciar', type: 6, required: true }, { name: 'minutos', description: 'Minutos', type: 4, required: true }, { name: 'razon', description: 'Razón', type: 3, required: false }], default_member_permissions: PermissionFlagsBits.ModerateMembers.toString() },
    { name: 'unmute', description: 'Quitar silencio', options: [{ name: 'usuario', description: 'Usuario a desmutear', type: 6, required: true }], default_member_permissions: PermissionFlagsBits.ModerateMembers.toString() },
    { name: 'warn', description: 'Advertir usuario', options: [{ name: 'usuario', description: 'Usuario a advertir', type: 6, required: true }, { name: 'razon', description: 'Razón', type: 3, required: true }] },
    { name: 'clear', description: 'Borrar mensajes', options: [{ name: 'cantidad', description: 'Cantidad', type: 4, required: true }], default_member_permissions: PermissionFlagsBits.ManageMessages.toString() },
    { name: 'slowmode', description: 'Cambiar cooldown', options: [{ name: 'segundos', description: 'Segundos', type: 4, required: true }], default_member_permissions: PermissionFlagsBits.ManageChannels.toString() },
    { name: 'setup-pets', description: 'Crear panel de ping-roles', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
    { name: 'mis-pings', description: 'Ver qué notificaciones de pets tienes activas' },
    { name: 'crear-canal-ping-roles', description: 'Crea SOLO el canal #🔗 | ping-roles en la categoría ROBA UN HUEVO', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
    { name: 'test-bienvenida', description: 'Probar mensaje de bienvenida', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
    { name: 'test-tiktok', description: 'Probar conexión con TikTok (con bypass)', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
    { name: 'live', description: 'Anunciar manualmente que estás en LIVE', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
  ]});
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if(guild){
    const general = guild.channels.cache.find(c => c.name.includes('general') && c.type === ChannelType.GuildText);
    if(general) await general.setRateLimitPerUser(10).catch(()=>{});
  }
  startTikTokMonitor();
  console.log('✅ Comandos registrados');
});

client.on(Events.GuildMemberAdd, async member => {
  const guild = member.guild;
  const rolPapoi = guild.roles.cache.find(r => r.name.toLowerCase() === 'papoi');
  if(rolPapoi) await member.roles.add(rolPapoi).catch(()=>{});
  const bienvenida = guild.channels.cache.find(c => c.name.includes('bienvenida'));
  if(bienvenida){
    const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(`👋 Bienvenido ${member.user.username} a Los Papois`).setDescription(`Ya eres **Papoi**!\n\n📜 Lee las reglas\n💬 Preséntate en general\n⭐ Sube de nivel hablando.`).setThumbnail(member.user.displayAvatarURL()).setTimestamp();
    bienvenida.send({ content: `${member}`, embeds: [embed] }).catch(()=>{});
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
      const canalMulti = msg.guild.channels.cache.find(c=>c.name.includes('multimedia'));
      const warn = await msg.channel.send({ content: `${msg.author} ❌ Multimedia **solo** en ${canalMulti ? `<#${canalMulti.id}>` : '#multimedia'}` }).catch(()=>{});
      if(warn) setTimeout(()=>warn.delete().catch(()=>{}), 5000);
      return;
    }
  }
  if(!isMod(member)){
    const tieneLink = /(https?:\/\/|www\.|discord\.gg|discord\.com\/invite|t\.me\/)/i.test(msg.content);
    if(tieneLink){
      await msg.delete().catch(()=>{});
      const warn = await msg.channel.send({ content: `${msg.author} ❌ Links bloqueados.` }).catch(()=>{});
      if(warn) setTimeout(()=>warn.delete().catch(()=>{}), 4000);
      return;
    }
  }
  const ahora = Date.now();
  const ultimo = lastXP.get(msg.author.id) || 0;
  if(ahora - ultimo > 60000){
    const gana = Math.floor(Math.random()*11)+15;
    xpData[msg.author.id] = (xpData[msg.author.id]||0) + gana;
    lastXP.set(msg.author.id, ahora);
    saveXP();
    for(const nivel of NIVELES){
      if(xpData[msg.author.id] >= nivel.xp){
        const rol = msg.guild.roles.cache.find(r => r.name === nivel.name);
        if(rol &&!member.roles.cache.has(rol.id)){
          await member.roles.add(rol).catch(()=>{});
          if(nivel.xp > 0) msg.channel.send({ content: `🎉 ${msg.author} subió a **${nivel.name}**! (${xpData[msg.author.id]} XP)` }).then(m=>setTimeout(()=>m.delete().catch(()=>{}),8000)).catch(()=>{});
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
    .setDescription(`**¡Bienvenido a Ping Roles!** 👋\n\nElige exactamente qué pets quieres que te avise.\n\n**1.** Abre un menú 👇\n**2.** Marca los pets\n**3.** ¡Listo! 🔛\n\n🍀 Secreto — 14 pets\n🚀 Eterno — 10 pets\n💎 Divino — 5 ULTRA raros\n`)
    .setThumbnail(guild.iconURL())
    .setTimestamp();
  const rowSecreto = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('pets_Secreto').setPlaceholder('🍀 Huevo Secreto').setMinValues(1).setMaxValues(Math.min(PETS['Secreto'].length, 25)).addOptions(PETS['Secreto'].map(p => ({ label: p, value: p, emoji: '🍀' }))));
  const rowEterno = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('pets_Eterno').setPlaceholder('🚀 Huevo Eterno').setMinValues(1).setMaxValues(Math.min(PETS['Eterno'].length, 25)).addOptions(PETS['Eterno'].map(p => ({ label: p, value: p, emoji: '🚀' }))));
  const rowDivino = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('pets_Divino').setPlaceholder('💎 Huevo Divino').setMinValues(1).setMaxValues(Math.min(PETS['Divino'].length, 25)).addOptions(PETS['Divino'].map(p => ({ label: p, value: p, emoji: '💎' }))));
  const rowBotones = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_my_pings').setLabel('📋 Mis Pings').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('btn_customize').setLabel('✨ Ayuda').setStyle(ButtonStyle.Success));
  await channel.send({ embeds: [embed], components: [rowSecreto, rowEterno, rowDivino, rowBotones] });
}

client.on(Events.InteractionCreate, async inter => {
  if(inter.isButton()){
    if(inter.customId === 'btn_my_pings'){
      await inter.deferReply({ flags: 64 });
      const rolesPet = inter.member.roles.cache.filter(r => ALL_PETS.some(p => p.toLowerCase() === r.name.toLowerCase())).map(r => r.name);
      if(!rolesPet.length) return inter.editReply({ content: '📭 No tienes pings activos.' });
      return inter.editReply({ content: `📋 Tus pings (${rolesPet.length}): ${rolesPet.join(', ')}` });
    }
    if(inter.customId === 'btn_customize'){ return inter.reply({ content: '👇 Abre un menú arriba y marca los pets.', flags: 64 }); }
  }
  if(inter.isStringSelectMenu()){
    if(inter.customId.startsWith('pets_')){
      await inter.deferReply({ flags: 64 });
      const seleccionados = inter.values;
      let agregados = []; let quitados = [];
      for(const petName of seleccionados){
        const rol = inter.guild.roles.cache.find(r => r.name.toLowerCase() === petName.toLowerCase());
        if(!rol) continue;
        if(inter.member.roles.cache.has(rol.id)){ await inter.member.roles.remove(rol).catch(()=>{}); quitados.push(petName); }
        else { await inter.member.roles.add(rol).catch(()=>{}); agregados.push(petName); }
      }
      let msg = ``;
      if(agregados.length) msg += `✅ Ahora te avisará de: **${agregados.join(', ')}**\n`;
      if(quitados.length) msg += `❌ Ya NO te avisará de: **${quitados.join(', ')}**\n`;
      return inter.editReply({ content: msg || 'Hecho' });
    }
  }
  if(!inter.isChatInputCommand()) return;
  if(inter.commandName === 'mis-pings'){
    await inter.deferReply({ flags: 64 });
    const rolesPet = inter.member.roles.cache.filter(r => ALL_PETS.some(p => p.toLowerCase() === r.name.toLowerCase())).map(r => r.name);
    if(!rolesPet.length) return inter.editReply({ content: '📭 No tienes pings activos.' });
    return inter.editReply({ content: `📋 Tus pings: ${rolesPet.join(', ')}` });
  }
  if(inter.commandName === 'crear-canal-ping-roles'){
    await inter.deferReply({ flags: 64 });
    const guild = inter.guild;
    let categoria = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('roba un huevo'));
    if(!categoria) categoria = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && (c.name.toLowerCase().includes('roba') || c.name.toLowerCase().includes('huevo')));
    if(!categoria) return inter.editReply({ content: '❌ No encontré categoría ROBA UN HUEVO.' });
    let canal = guild.channels.cache.find(c => c.name.toLowerCase().includes('ping-roles'));
    if(!canal){
      canal = await guild.channels.create({ name: '🔗 | ping-roles', type: ChannelType.GuildText, parent: categoria.id, permissionOverwrites: [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }, { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks] }] });
    }
    await crearPanelPingRoles(canal);
    return inter.editReply({ content: `✅ Canal reparado: ${canal}` });
  }
  if(!isMod(inter.member) &&!['rank','separar-papois-exacto','mis-pings'].includes(inter.commandName)){
    if(['setup-pets','crear-canal-ping-roles','test-bienvenida','test-tiktok','live'].includes(inter.commandName)){
      if(!inter.memberPermissions.has(PermissionFlagsBits.Administrator) && !isMod(inter.member)){ return inter.reply({ content: '❌ Solo Moderador / Papoi Mayor', flags: 64 }); }
    } else { return inter.reply({ content: '❌ Solo Moderador / Papoi Mayor', flags: 64 }); }
  }
  if(inter.commandName === 'setup-pets'){ await inter.deferReply({ flags: 64 }); await crearPanelPingRoles(inter.channel); return inter.editReply({ content: '✅ Panel creado.' }); }
  if(inter.commandName === 'separar-papois-exacto'){
    await inter.deferReply({ flags: 64 });
    for(const [id, rol] of inter.guild.roles.cache){
      if(rol.name === '@everyone' || rol.managed) continue;
      if(SOLO_HOIST.includes(rol.name.toLowerCase())) await rol.setHoist(true).catch(()=>{});
      else await rol.setHoist(false).catch(()=>{});
      await new Promise(r=>setTimeout(r,150));
    }
    return inter.editReply('✅ Solo los 8 Papois separados.');
  }
  if(inter.commandName === 'rank'){
    const user = inter.options.getUser('usuario') || inter.user;
    const xp = xpData[user.id]||0;
    let nivelActual = 'Papoi';
    for(const n of NIVELES) if(xp >= n.xp) nivelActual = n.name;
    return inter.reply({ content: `⭐ **${user.username}** - ${xp} XP - Nivel: **${nivelActual}**`, flags: 64 });
  }
  if(inter.commandName === 'test-bienvenida'){
    const bienvenida = inter.guild.channels.cache.find(c => c.name.toLowerCase().includes('bienvenida'));
    if(!bienvenida) return inter.reply({ content: '❌ No encontré canal bienvenida', flags: 64 });
    const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(`👋 Bienvenido ${inter.user.username} a Los Papois`).setDescription(`Ya eres **Papoi**!`).setThumbnail(inter.user.displayAvatarURL()).setTimestamp();
    await bienvenida.send({ content: `${inter.user}`, embeds: [embed] }).catch(()=>{});
    return inter.reply({ content: `✅ Prueba enviada a ${bienvenida}`, flags: 64 });
  }
  if(inter.commandName === 'test-tiktok'){
    await inter.deferReply({ flags: 64 });
    const result = await testTikTokAPIs();
    return inter.editReply({ content: result.slice(0,1900) });
  }
  if(inter.commandName === 'live'){
    const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
    const canalLive = inter.guild.channels.cache.find(c => c.name.toLowerCase().includes('elcris-en-vivo'));
    if(!canalLive) return inter.reply({ content: '❌ No encontré canal elcris-en-vivo', flags: 64 });
    await canalLive.send({ content: `🔴 **@everyone ELCRIS ESTÁ EN VIVO EN TIKTOK!**\nhttps://www.tiktok.com/@${tiktokUser}/live\n¡Vayan a apoyar!` }).catch(()=>{});
    return inter.reply({ content: `✅ Anuncio LIVE enviado a ${canalLive}`, flags: 64 });
  }
  if(inter.commandName === 'ban'){ const user = inter.options.getMember('usuario'); const razon = inter.options.getString('razon')||'Sin razón'; if(user) await user.ban({ reason: razon }).catch(()=>{}); return inter.reply({ content: `🔨 Baneado ${user?.user.tag} - ${razon}` }); }
  if(inter.commandName === 'kick'){ const user = inter.options.getMember('usuario'); const razon = inter.options.getString('razon')||'Sin razón'; if(user) await user.kick(razon).catch(()=>{}); return inter.reply({ content: `👢 Kick a ${user?.user.tag}` }); }
  if(inter.commandName === 'mute'){ const user = inter.options.getMember('usuario'); const mins = inter.options.getInteger('minutos'); const razon = inter.options.getString('razon')||'Silenciado'; if(user) await user.timeout(mins*60*1000, razon).catch(()=>{}); return inter.reply({ content: `🔇 ${user?.user.tag} muteado ${mins}m` }); }
  if(inter.commandName === 'unmute'){ const user = inter.options.getMember('usuario'); if(user) await user.timeout(null).catch(()=>{}); return inter.reply({ content: `🔊 ${user?.user.tag} desmuteado` }); }
  if(inter.commandName === 'warn'){ const user = inter.options.getUser('usuario'); const razon = inter.options.getString('razon'); const canal = inter.guild.channels.cache.find(c=>c.name.includes('general')); if(canal) canal.send({ content: `⚠ ${user} advertencia: ${razon}` }).catch(()=>{}); return inter.reply({ content: `⚠ Warn a ${user.tag}`, flags: 64 }); }
  if(inter.commandName === 'clear'){ const cant = inter.options.getInteger('cantidad'); await inter.channel.bulkDelete(cant, true).catch(()=>{}); return inter.reply({ content: `🧹 Borrados ${cant} mensajes`, flags: 64 }); }
  if(inter.commandName === 'slowmode'){ const seg = inter.options.getInteger('segundos'); await inter.channel.setRateLimitPerUser(seg).catch(()=>{}); return inter.reply({ content: `⏳ Slowmode puesto a ${seg}s` }); }
});

// --- BYPASS 403 CON PROXY + SCRAPING ---
async function fetchTikWMViaProxy(tiktokUser){
  const tikwmUrl = `https://www.tikwm.com/api/user/posts?unique_id=${tiktokUser}&count=1`;
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(tikwmUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(tikwmUrl)}`,
  ];

  for(const proxyUrl of proxies){
    try{
      console.log(`🔄 Probando proxy: ${proxyUrl.slice(0,50)}...`);
      const res = await axios.get(proxyUrl, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      let data = res.data;
      // allorigins raw devuelve string JSON
      if(typeof data === 'string'){
        try{ data = JSON.parse(data); }catch{}
      }
      if(data && data.data && data.data.videos && data.data.videos[0]){
        console.log(`✅ Proxy OK! video_id=${data.data.videos[0].video_id}`);
        return data;
      }
    }catch(e){
      console.log(`❌ Proxy falló: ${e.message}`);
    }
  }
  return null;
}

async function scrapeTikTokDirect(tiktokUser){
  try{
    console.log(`🔍 Scrapeando https://www.tiktok.com/@${tiktokUser}`);
    const res = await axios.get(`https://www.tiktok.com/@${tiktokUser}`, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
      }
    });
    const html = res.data;
    // Busca video IDs en el HTML (TikTok mete JSON con itemId)
    const regex = /"id":"(\d{18,20})"/g;
    const regex2 = /\/video\/(\d{18,20})/g;
    let ids = [];
    let m;
    while((m = regex.exec(html)) !== null) ids.push(m[1]);
    while((m = regex2.exec(html)) !== null) ids.push(m[1]);
    ids = [...new Set(ids)];
    
    const isLive = html.includes('"isLive":true') || html.includes('"is_live":true') || html.includes('isLiveRoom') || html.toLowerCase().includes('currently live');
    
    console.log(`📄 Scrape result: ${ids.length} videos encontrados, isLive=${isLive}, html ${html.length} chars`);
    return { videoIds: ids, isLive, htmlLength: html.length };
  }catch(e){
    console.log(`❌ Scrape falló: ${e.message}`);
    return { videoIds: [], isLive: false, htmlLength: 0 };
  }
}

async function testTikTokAPIs(){
  const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
  let result = `🧪 Probando @${tiktokUser} con BYPASS...\n\n`;

  // 1. Directo tikwm (sabemos que da 403 pero lo mostramos)
  try{
    const res = await axios.get(`https://www.tikwm.com/api/user/posts?unique_id=${tiktokUser}&count=1`, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tikwm.com/' } });
    result += `✅ Directo tikwm: ${res.data?.data?.videos?.[0]?.video_id}\n`;
  }catch(e){ result += `❌ Directo tikwm: ${e.response?.status || e.message} (Railway bloqueado)\n`; }

  // 2. Via Proxy allorigins
  try{
    const data = await fetchTikWMViaProxy(tiktokUser);
    if(data && data.data && data.data.videos){
      result += `✅ Proxy allorigins: OK video=${data.data.videos[0].video_id} titulo=${data.data.videos[0].title?.slice(0,30)}\n`;
    } else {
      result += `❌ Proxy allorigins: sin datos\n`;
    }
  }catch(e){ result += `❌ Proxy allorigins: ${e.message}\n`; }

  // 3. Scraping directo tiktok.com
  try{
    const scrape = await scrapeTikTokDirect(tiktokUser);
    if(scrape.videoIds.length > 0){
      result += `✅ Scrape tiktok.com: ${scrape.videoIds.length} videos, último=${scrape.videoIds[0]} isLive=${scrape.isLive}\n`;
    } else {
      result += `⚠️ Scrape tiktok.com: HTML ${scrape.htmlLength} chars pero 0 videos (TikTok cambió HTML)\n`;
    }
  }catch(e){ result += `❌ Scrape: ${e.message}\n`; }

  result += `\nCache: lastVideo=${tiktokCache.lastVideoId} isLive=${tiktokCache.isLiveNow}\n`;
  result += `\n💡 Si proxy funciona, el auto de videos sí avisará. Para LIVE usa /live manual (100% fiable).`;
  return result;
}

async function checkTikTok(){
  const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if(!guild) return;
  console.log(`🔍 [TikTok] Check @${tiktokUser} con bypass...`);

  // Intenta primero via proxy
  let video = null;
  const proxyData = await fetchTikWMViaProxy(tiktokUser);
  if(proxyData && proxyData.data && proxyData.data.videos && proxyData.data.videos[0]){
    video = proxyData.data.videos[0];
  } else {
    // Fallback a scraping directo
    const scrape = await scrapeTikTokDirect(tiktokUser);
    if(scrape.videoIds.length > 0){
      // Crea un objeto fake similar a tikwm
      video = { video_id: scrape.videoIds[0], title: 'Nuevo video en TikTok', cover: null };
      // Si scraping detectó live, también maneja live
      if(scrape.isLive && !tiktokCache.isLiveNow){
        console.log('🔴 LIVE detectado por scraping!');
        tiktokCache.isLiveNow = true; saveTikTok();
        const canalLive = guild.channels.cache.find(c => c.name.toLowerCase().includes('elcris-en-vivo'));
        if(canalLive) await canalLive.send({ content: `🔴 **@everyone ELCRIS ESTÁ EN VIVO EN TIKTOK!**\nhttps://www.tiktok.com/@${tiktokUser}/live\n¡Vayan a apoyar!` }).catch(()=>{});
        return;
      }
    }
  }

  if(video){
    console.log(`📹 Video detectado: ${video.video_id} vs cache ${tiktokCache.lastVideoId}`);
    if(tiktokCache.lastVideoId === null){
      tiktokCache.lastVideoId = video.video_id;
      saveTikTok();
      console.log('💾 Primer video guardado sin notificar');
    } else if(video.video_id !== tiktokCache.lastVideoId){
      console.log('🎬 NUEVO VIDEO!');
      tiktokCache.lastVideoId = video.video_id;
      saveTikTok();
      const canalClips = guild.channels.cache.find(c => c.name.toLowerCase().includes('clips-tiktok'));
      if(canalClips){
        const embed = new EmbedBuilder().setColor(0x00f2ea).setTitle(`🎬 Nuevo video de @${tiktokUser}!`).setDescription(video.title || '¡Nuevo TikTok!').setImage(video.cover || null).setURL(`https://www.tiktok.com/@${tiktokUser}/video/${video.video_id}`).setTimestamp();
        await canalClips.send({ content: `@everyone`, embeds: [embed] }).catch(e=>console.log(e.message));
        console.log(`✅ Aviso video enviado a #${canalClips.name}`);
      }
    }
  } else {
    console.log('⚠️ No se pudo obtener video ni por proxy ni por scraping');
  }

  // Para LIVE, el scraping ya lo intentó arriba. Si no detectó, resetea estado si estaba en live
  if(!tiktokCache.isLiveNow){
    // no hace nada
  } else {
    // Si llevaba tiempo en live y ahora no lo detecta, resetea después de un rato (lo dejamos simple)
    // No reseteamos automático para evitar falsos negativos, solo con comando o cuando API diga que no
  }
}

function startTikTokMonitor(){
  const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
  console.log(`🎬 Monitor TikTok BYPASS iniciado @${tiktokUser} cada 90s`);
  setTimeout(checkTikTok, 15000);
  setInterval(checkTikTok, 90000);
}

client.login(process.env.DISCORD_TOKEN);
