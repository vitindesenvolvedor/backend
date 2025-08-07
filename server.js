// server.js
import express from "express";
import session from "express-session";
import bodyParser from "body-parser";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Sessão para login com Discord
app.use(session({
  secret: "corestudios-secret",
  resave: false,
  saveUninitialized: false,
}));

app.use(bodyParser.json());

// Discord bot setup
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = "1402754022577799352";

const CARGOS = {
  "Plano Básico": "1384768443005407433",
  "Plano Pro": "1402775297442713670",
  "Bot Premium": "1384768441424019556",
};

client.once("ready", () => {
  console.log(`🤖 Bot conectado como ${client.user.tag}`);
});
client.login(TOKEN);

// Webhook do Mercado Pago
app.post("/webhook", async (req, res) => {
  const data = req.body;

  try {
    const { external_reference, status, payer_email } = data;

    if (status === "approved") {
      const [discordId, plano] = external_reference.split(":");
      const cargoId = CARGOS[plano];
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(discordId);

      await member.roles.add(cargoId);

      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
      const embed = new EmbedBuilder()
        .setTitle("💸 Pagamento Recebido")
        .setDescription(`O usuário <@${discordId}> comprou o plano **${plano}**.`)
        .addFields(
          { name: "Email do pagador", value: payer_email, inline: true },
          { name: "ID do usuário", value: discordId, inline: true }
        )
        .setColor("Green")
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });
      console.log(`[OK] Cargo aplicado e log enviado para ${discordId}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no Webhook:", err);
    res.sendStatus(500);
  }
});

// Rota de login com Discord
app.get("/login", (req, res) => {
  const redirectUri = encodeURIComponent(process.env.REDIRECT_URI);
  const url = `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=identify`;
  res.redirect(url);
});

// Callback do Discord
app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) return res.send("Erro ao logar com o Discord.");

  try {
    const tokenRes = await axios.post("https://discord.com/api/oauth2/token", new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.REDIRECT_URI,
      scope: "identify"
    }), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    const accessToken = tokenRes.data.access_token;

    const userRes = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const user = userRes.data;
    req.session.user = user;

    console.log("✅ Usuário logado:", user);

    res.redirect("/dashboard");
  } catch (err) {
    console.error("Erro no login:", err.response?.data || err.message);
    res.send("Erro ao logar.");
  }
});

// Rota protegida de exemplo
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const user = req.session.user;
  res.send(`
    <h1>Olá, ${user.username}#${user.discriminator}</h1>
    <p>ID: ${user.id}</p>
    <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" width="100" />
    <p><a href="/logout">Sair</a></p>
  `);
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
