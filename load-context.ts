/// <reference path="./worker-configuration.d.ts" />
import type { PrismaClient } from '@prisma/client'
import type {} from 'react-router'

declare module 'react-router' {
	interface AppLoadContext {
		cloudflare?: { env: Env; ctx: ExecutionContext }
		runtime?: { env: Record<string, string | undefined>; prisma: PrismaClient }
	}
}
