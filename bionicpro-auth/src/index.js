import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const app = express();

app.use(express.json());
app.use(cookieParser());

const {
    PORT = 3001,
    FRONTEND_URL,
    KEYCLOAK_BASE_URL,
    KEYCLOAK_REALM,
    KEYCLOAK_CLIENT_ID,
    KEYCLOAK_CLIENT_SECRET,
    COOKIE_NAME = 'sid',
    COOKIE_SECURE = 'false',
    SESSION_ROTATION = 'true',
    ACCESS_SKEW_SECONDS = '10',
} = process.env;

app.use(cors({
    origin: FRONTEND_URL,
    credentials: true,
}));

const PUBLIC_BASE  = process.env.KEYCLOAK_PUBLIC_URL   || KEYCLOAK_BASE_URL;
const INTERNAL_BASE = process.env.KEYCLOAK_INTERNAL_URL || KEYCLOAK_BASE_URL;

const AUTHORIZE_URL = `${PUBLIC_BASE}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth`;
const TOKEN_URL     = `${INTERNAL_BASE}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

const ACCESS_SKEW = Number(ACCESS_SKEW_SECONDS) || 0; // parse once

// ── Логирование ──────────────────────────────────────────────────────────────

const logger = {
    info:  (ctx, payload) => console.log( `[${ctx}]`, payload),
    error: (ctx, payload) => console.error(`[${ctx}]`, payload),
};

// ── Хранилище сессий (in-memory) ─────────────────────────────────────────────

const sessionStore = new Map();

// ── Утилиты ───────────────────────────────────────────────────────────────────

const genSid = () => crypto.randomBytes(32).toString('base64url');

const nowSec = () => Math.floor(Date.now() / 1000);

function setSidCookie(res, sid) {
    res.cookie(COOKIE_NAME, sid, {
        httpOnly: true,
        secure: COOKIE_SECURE === 'true',
        sameSite: 'lax',
        path: '/',
    });
}

const clearSidCookie = (res) => res.clearCookie(COOKIE_NAME, { path: '/' });

function decodeAccessToken(token) {
    const payload = jwt.decode(token);
    if (!payload || typeof payload !== 'object') throw new Error('Cannot decode access token');

    return {
        userId:    payload.preferred_username ?? payload.sub,
        roles:     payload.realm_access?.roles ?? [],
        accessExp: payload.exp,
    };
}

const isAccessExpired = (expSec) => nowSec() >= expSec - ACCESS_SKEW;

// ── Keycloak token exchange ───────────────────────────────────────────────────

const TOKEN_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' };

function buildClientParams() {
    const p = new URLSearchParams();
    p.set('client_id',     KEYCLOAK_CLIENT_ID);
    p.set('client_secret', KEYCLOAK_CLIENT_SECRET);
    return p;
}

async function exchangeCode(code, redirectUri) {
    const form = buildClientParams();
    form.set('grant_type',   'authorization_code');
    form.set('code',         code);
    form.set('redirect_uri', redirectUri);

    const { data } = await axios.post(TOKEN_URL, form, { headers: TOKEN_HEADERS });
    return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

async function exchangeRefreshToken(refreshToken) {
    const form = buildClientParams();
    form.set('grant_type',    'refresh_token');
    form.set('refresh_token', refreshToken);

    const { data } = await axios.post(TOKEN_URL, form, { headers: TOKEN_HEADERS });
    return {
        accessToken:  data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
    };
}

// ── Session helpers ───────────────────────────────────────────────────────────

function createSession(tokenData) {
    const { accessToken, refreshToken } = tokenData;
    const { userId, roles, accessExp }  = decodeAccessToken(accessToken);
    const sid = genSid();

    sessionStore.set(sid, { accessToken, refreshToken, accessExp, userId, roles, createdAt: Date.now() });
    return { sid, userId, roles, accessExp };
}

function rotateSession(oldSid) {
    const session = sessionStore.get(oldSid);
    if (!session) return null;

    const newSid = genSid();
    sessionStore.set(newSid, { ...session, createdAt: Date.now() });
    sessionStore.delete(oldSid);
    return newSid;
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/login', (req, res) => {
    const redirectUri = `${req.protocol}://${req.get('host')}/callback`;

    logger.info('/login', { AUTHORIZE_URL, PUBLIC_BASE, INTERNAL_BASE });

    const params = new URLSearchParams({
        client_id:     KEYCLOAK_CLIENT_ID,
        redirect_uri:  redirectUri,
        response_type: 'code',
        scope:         'openid',
        state:         crypto.randomBytes(16).toString('hex'),
    });

    res.redirect(`${AUTHORIZE_URL}?${params}`);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code');

    try {
        const redirectUri = `${req.protocol}://${req.get('host')}/callback`;
        const tokens      = await exchangeCode(code, redirectUri);
        const { sid }     = createSession(tokens);

        logger.info('/callback', { accessLen: tokens.accessToken.length, refreshLen: tokens.refreshToken.length });

        setSidCookie(res, sid);
        res.redirect(FRONTEND_URL);
    } catch (err) {
        logger.error('/callback', err?.response?.data ?? err);
        clearSidCookie(res);
        res.status(500).send('Auth callback failed');
    }
});

app.post('/sessions/validate', async (req, res) => {
    const sid = req.body?.sid ?? req.cookies?.[COOKIE_NAME];

    logger.info('/sessions/validate', { sid, storeSize: sessionStore.size });

    if (!sid) return res.status(401).json({ valid: false });

    const session = sessionStore.get(sid);
    if (!session) return res.status(401).json({ valid: false });

    try {
        let { accessToken, refreshToken, accessExp } = session;

        if (isAccessExpired(accessExp)) {
            logger.info('/sessions/validate', { action: 'refresh', sid });

            ({ accessToken, refreshToken } = await exchangeRefreshToken(refreshToken));

            const decoded = decodeAccessToken(accessToken);
            accessExp     = decoded.accessExp;

            sessionStore.set(sid, { ...session, accessToken, refreshToken, accessExp, userId: decoded.userId, roles: decoded.roles });
        }

        let activeSid = sid;

        if (SESSION_ROTATION === 'true') {
            const rotatedSid = rotateSession(sid);
            if (rotatedSid) {
                activeSid = rotatedSid;
                setSidCookie(res, activeSid);
            }
        }

        const { userId, roles } = sessionStore.get(activeSid) ?? session;

        return res.json({ valid: true, userId, roles, newSid: activeSid !== sid ? activeSid : null });
    } catch (err) {
        logger.error('/sessions/validate', err?.response?.data ?? err);
        return res.status(500).json({ valid: false });
    }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`auth-service listening on http://localhost:${PORT}`));