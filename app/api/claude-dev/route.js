// GITHUB_PAT env var set 1783625266 - redeploy to pick it up
// app/api/claude-dev/route.js
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()
const SOURCE_REPO = 'andrewdinbc/math-mastery'

async function readRepoFile(path) {
  const token = process.env.GITHUB_PAT
  if (!token) return { error: 'GITHUB_PAT not configured on this app - cannot read repo files.' }
  const res = await fetch(`https://api.github.com/repos/${SOURCE_REPO}/contents/${path}`, {
    headers: { Authorization: `token ${token}` },
  })
  if (!res.ok) return { error: `Could not read ${path} (status ${res.status}) - check the path is correct.` }
  const data = await res.json()
  if (data.type !== 'file') return { error: `${path} is not a file.` }
  return { content: Buffer.from(data.content, 'base64').toString('utf-8').slice(0, 8000) }
}

const TOOLS = [
  {
    name: 'read_repo_file',
    description: `Read a file from this app's own source repo (${SOURCE_REPO}) to answer questions about how it's built.`,
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path relative to repo root' } },
      required: ['path'],
    },
  },
  { type: 'web_search_20250305', name: 'web_search' },
]

export async function POST(request) {
  const { system, messages: inputMessages } = await request.json().catch(() => ({}))
  if (!inputMessages || !Array.isArray(inputMessages)) {
    return Response.json({ error: 'messages array required' }, { status: 400 })
  }

  const fullSystem = `${system || ''}

You have two tools: read_repo_file (reads this app's own source code) and web_search (searches the web). When the person asks an investigative question, use the relevant tool and give a real answer instead of saying you don't have access.`

  try {
    let messages = [...inputMessages]
    let finalContent = null

    for (let round = 0; round < 4; round++) {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: fullSystem,
        tools: TOOLS,
        messages,
      })

      if (response.stop_reason !== 'tool_use') {
        finalContent = response.content
        break
      }

      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use')
      const toolResults = []
      for (const block of toolUseBlocks) {
        if (block.name === 'read_repo_file') {
          const result = await readRepoFile(block.input.path)
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
        }
      }

      messages = [
        ...messages,
        { role: 'assistant', content: response.content },
        ...(toolResults.length ? [{ role: 'user', content: toolResults }] : []),
      ]
      finalContent = response.content
    }

    return Response.json({ content: finalContent })
  } catch (error) {
    console.error('claude-dev error:', error)
    return Response.json({ error: 'AI request failed', details: error.message }, { status: 500 })
  }
}
