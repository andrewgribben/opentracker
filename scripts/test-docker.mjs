import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const image = process.env.TEST_IMAGE ?? 'opentracker:local'
const name = `opentracker-test-${randomUUID()}`
const volume = `${name}-data`
const dataDir = process.env.TEST_STORAGE_ROOT ? mkdtempSync(join(process.env.TEST_STORAGE_ROOT, 'opentracker-test-')) : undefined
const storage = dataDir ?? volume
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim()
let baseUrl
let cookie
async function start() {
	docker(
		'run',
		'-d',
		'--name',
		name,
		'-p',
		'127.0.0.1::3000',
		'-v',
		`${storage}:/data`,
		'-e',
		'DASHBOARD_URL=http://tracker.example.test',
		image,
	)
	baseUrl = `http://${docker('port', name, '3000/tcp')}`
	for (let i = 0; i < 60; i++) {
		try {
			if ((await fetch(`${baseUrl}/health`)).ok) return
		} catch {}
		await delay(1000)
	}
	throw new Error(`Container failed to start:\n${docker('logs', name)}`)
}
async function request(path, options = {}) {
	return fetch(`${baseUrl}${path}`, {
		redirect: 'manual',
		...options,
		headers: { ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
	})
}
const form = value => new URLSearchParams({ json: JSON.stringify(value) })
try {
	await start()
	assert.equal((await request('/')).status, 200)
	assert.equal((await request('/api/projects')).status, 401)
	const signup = await request('/signup', {
		method: 'POST',
		body: form({ email: `${name}@example.test`, password: 'ContainerTestPassword123!' }),
		headers: { 'cf-connecting-ip': '10.0.0.1' },
	})
	assert.equal(signup.status, 302)
	const sessionCookie = signup.headers.get('set-cookie')
	assert.ok(sessionCookie)
	assert.ok(!/; secure/i.test(sessionCookie), 'Direct HTTP must allow cookies')
	cookie = sessionCookie.split(';')[0]
	const project = await request('/tracker/new', { method: 'POST', body: form({ name: 'Docker persistence test' }) })
	assert.equal(project.status, 302)
	const boardPath = project.headers.get('location')
	assert.ok(boardPath?.startsWith('/tracker/'))
	const projectId = boardPath.split('/').pop()
	const profile = await request('/profile', { method: 'POST', body: form({ type: 'createApiKey', name: 'Docker test' }) })
	assert.equal(profile.status, 200)
	const apiKey = (await profile.text()).match(/lt_[a-f0-9-]{36}/)?.[0]
	assert.ok(apiKey, 'Profile must show the newly created API key')
	const auth = { Authorization: `Bearer ${apiKey}` }
	const storyResponse = await request(`/api/projects/${projectId}/stories`, {
		method: 'POST',
		headers: { ...auth, 'Content-Type': 'application/json' },
		body: JSON.stringify({ title: 'Survives recreation', type: 'feature', points: 2 }),
	})
	assert.equal(storyResponse.status, 201)
	const story = await storyResponse.json()
	assert.ok(story.url.startsWith('http://tracker.example.test/tracker/'))
	const mcp = await request('/mcp', {
		method: 'POST',
		headers: { ...auth, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'docker-smoke', version: '1' } },
		}),
	})
	assert.equal(mcp.status, 200)
	assert.ok((await mcp.text()).includes('protocolVersion'))
	docker('stop', name)
	docker('rm', name)
	await start()
	const board = await request(boardPath)
	assert.equal(board.status, 200, 'Session signing secret must survive recreation')
	assert.ok((await board.text()).includes('Survives recreation'), 'Story must survive recreation')
	const projects = await request('/api/projects', { headers: auth })
	assert.equal(projects.status, 200, 'API key must survive recreation')
	assert.ok((await projects.text()).includes(projectId))
	const identity = docker('exec', name, 'sh', '-c', 'stat -c %u:%g /data/opentracker.db')
	assert.equal(identity, '99:100')
	console.log(
		'PASS: migrations, HTTP signup/session, project/story, API, MCP, permissions, and persistence after container recreation',
	)
} catch (error) {
	try {
		console.error(docker('logs', name))
	} catch {}
	throw error
} finally {
	try {
		docker('rm', '-f', name)
	} catch {}
	try {
		if (dataDir) rmSync(dataDir, { recursive: true, force: true })
		else docker('volume', 'rm', volume)
	} catch {}
}
