import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@prisma/client'
import { AppLoadContext } from 'react-router'

export type { PrismaClient }

export function getPrisma({ context }: { context: AppLoadContext }) {
	if (context.runtime) return context.runtime.prisma
	if (!context.cloudflare) throw new Error('Missing database context')
	const adapter = new PrismaD1(context.cloudflare.env.DB)
	const prisma = new PrismaClient({ adapter })
	return prisma
}
