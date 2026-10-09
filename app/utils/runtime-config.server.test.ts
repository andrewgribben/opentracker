import { PrismaClient } from '@prisma/client'
import type { AppLoadContext } from 'react-router'
import { describe, expect, it } from 'vitest'
import { contextToBackendConfig } from './backendConfig'
import { getPrisma } from './db.server'
import { createSessionCookie } from './session.server'

function nodeContext(env: Record<string, string | undefined>): AppLoadContext {
	return {
		runtime: { env: { SESSION_SECRET: 'test-session-secret-at-least-32-characters', ...env }, prisma: new PrismaClient() },
	}
}

describe('standalone runtime', () => {
	it('uses the shared SQLite client', () => {
		const context = nodeContext({})
		expect(getPrisma({ context })).toBe(context.runtime?.prisma)
	})

	it('reads external links and optional integrations from container settings', () => {
		const config = contextToBackendConfig(
			nodeContext({ DASHBOARD_URL: 'https://tracker.example', SES_AWS_REGION: 'eu-west-2', USERO_CLIENT_ID: '' }),
		)
		expect(config.dashboardUrl).toBe('https://tracker.example')
		expect(config.sesRegion).toBe('eu-west-2')
		expect(config.useroClientId).toBe('')
	})

	it('allows direct HTTP cookies while running in production', async () => {
		const header = await createSessionCookie(nodeContext({ ENVIRONMENT: 'prod', COOKIE_SECURE: 'false' })).serialize('value')
		expect(header).not.toMatch(/; Secure/i)
		expect(header).toContain('HttpOnly')
	})

	it('keeps secure cookies as the production default', async () => {
		const header = await createSessionCookie(nodeContext({ ENVIRONMENT: 'prod' })).serialize('value')
		expect(header).toMatch(/; Secure/i)
	})
})
