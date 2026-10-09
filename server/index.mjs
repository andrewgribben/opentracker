import express from 'express'
import { createRequestHandler } from '@react-router/express'
import { PrismaClient } from '@prisma/client'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const port = Number(process.env.PORT ?? 3000)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535')
for (const name of ['COOKIE_SECURE', 'TRUST_PROXY']) {
	if (process.env[name] && !['true', 'false'].includes(process.env[name])) throw new Error(`${name} must be true or false`)
}
const dataDir = process.env.DATA_DIR ?? '/data'
mkdirSync(dataDir, { recursive: true })
if (!process.env.SESSION_SECRET) {
	const secretPath = `${dataDir}/session-secret`
	try {
		writeFileSync(secretPath, randomBytes(48).toString('hex'), { flag: 'wx', mode: 0o600 })
	} catch (error) {
		if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
	}
	process.env.SESSION_SECRET = readFileSync(secretPath, 'utf8').trim()
}
if (process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters')
process.env.ENVIRONMENT ??= 'prod'
process.env.USERO_CLIENT_ID ??= ''
process.env.DASHBOARD_URL ??= `http://localhost:${port}`
const dashboardUrl = new URL(process.env.DASHBOARD_URL)
if (!['http:', 'https:'].includes(dashboardUrl.protocol)) throw new Error('DASHBOARD_URL must be an HTTP(S) URL')
if (!process.env.COOKIE_SECURE) process.env.COOKIE_SECURE = String(dashboardUrl.protocol === 'https:')

const prisma = new PrismaClient()
await prisma.$connect()
const build = await import('../build/server/index.js')
const app = express()
app.disable('x-powered-by')
// Trust only the adjacent proxy; it must overwrite forwarded headers.
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1)
app.get('/health', async (_request, response) => {
	try {
		await prisma.user.count()
		response.json({ status: 'ok' })
	} catch {
		response.status(503).json({ status: 'unavailable' })
	}
})
app.use('/assets', express.static('build/client/assets', { immutable: true, maxAge: '1y' }))
app.use(express.static('build/client', { maxAge: '1h' }))
app.use((request, _response, next) => {
	// Discard externally supplied Cloudflare IP headers on the Node runtime.
	request.headers['cf-connecting-ip'] = request.ip ?? request.socket.remoteAddress ?? 'unknown'
	next()
})
app.use(createRequestHandler({ build, mode: 'production', getLoadContext: () => ({ runtime: { env: process.env, prisma } }) }))
const server = app.listen(port, '0.0.0.0', () => console.log(`opentracker listening on port ${port}`))
for (const signal of ['SIGTERM', 'SIGINT']) {
	process.on(signal, () => {
		const timeout = setTimeout(() => process.exit(1), 10000)
		timeout.unref()
		server.close(async () => {
			await prisma.$disconnect()
			process.exit(0)
		})
	})
}
