import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
}

type ShareRow = {
  id: string
  bill_id: string
  member_id: string
  amount_cents: number
  paid_at: string | null
  idempotency_key: string | null
}

type MemberRow = {
  id: string
  home_id: string
  name: string
  created_at: string
}

type BillRow = {
  id: string
  home_id: string
  title: string
  total_cents: number
  created_at: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/api/health', (c) => c.json({ status: 'ok' }))

// GET /api/homes - List all homes (helpful for UI)
app.get('/api/homes', async (c) => {
  const result = await c.env.DB.prepare('SELECT id, name FROM homes ORDER BY rowid ASC').all<{
    id: string
    name: string
  }>()
  return c.json({ homes: result.results })
})

// POST /api/homes - Create a home
app.post('/api/homes', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('name' in body) ||
    typeof (body as { name: unknown }).name !== 'string' ||
    (body as { name: string }).name.trim() === ''
  ) {
    return c.json({ error: 'Home name is required' }, 400)
  }

  const name = (body as { name: string }).name.trim()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare('INSERT INTO homes (id, name, created_at) VALUES (?, ?, ?)')
    .bind(id, name, now)
    .run()

  return c.json({ id, name }, 201)
})

// GET /api/homes/:homeId - Get single home details
app.get('/api/homes/:homeId', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await c.env.DB.prepare('SELECT id, name FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string; name: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  return c.json(home)
})

// GET /api/homes/:homeId/members - Get members of a home
app.get('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()
  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const members = await c.env.DB.prepare(
    'SELECT id, home_id as homeId, name FROM members WHERE home_id = ? ORDER BY rowid ASC',
  )
    .bind(homeId)
    .all<{ id: string; homeId: string; name: string }>()

  return c.json({ members: members.results })
})

// POST /api/homes/:homeId/members - Add a member to a home
app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()
  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('name' in body) ||
    typeof (body as { name: unknown }).name !== 'string' ||
    (body as { name: string }).name.trim() === ''
  ) {
    return c.json({ error: 'Member name is required' }, 400)
  }

  const name = (body as { name: string }).name.trim()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare('INSERT INTO members (id, home_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, homeId, name, now)
    .run()

  return c.json({ id, homeId, name }, 201)
})

// GET /api/homes/:homeId/bills - List bills and shares for a home (for Web UI)
app.get('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()
  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const billsResult = await c.env.DB.prepare(
    'SELECT id, home_id, title, total_cents, created_at FROM bills WHERE home_id = ? ORDER BY rowid DESC',
  )
    .bind(homeId)
    .all<BillRow>()

  const bills = billsResult.results

  const sharesResult = await c.env.DB.prepare(
    `SELECT s.id, s.bill_id, s.member_id, s.amount_cents, s.paid_at, m.name as member_name
     FROM shares s
     JOIN bills b ON s.bill_id = b.id
     JOIN members m ON s.member_id = m.id
     WHERE b.home_id = ?
     ORDER BY s.rowid ASC`,
  )
    .bind(homeId)
    .all<ShareRow & { member_name: string }>()

  const sharesByBill = new Map<
    string,
    Array<{
      id: string
      memberId: string
      memberName: string
      amountCents: number
      paidAt: string | null
    }>
  >()

  for (const s of sharesResult.results) {
    const list = sharesByBill.get(s.bill_id) ?? []
    list.push({
      id: s.id,
      memberId: s.member_id,
      memberName: s.member_name,
      amountCents: s.amount_cents,
      paidAt: s.paid_at,
    })
    sharesByBill.set(s.bill_id, list)
  }

  const enrichedBills = bills.map((b) => ({
    id: b.id,
    homeId: b.home_id,
    title: b.title,
    totalCents: b.total_cents,
    createdAt: b.created_at,
    shares: sharesByBill.get(b.id) ?? [],
  }))

  return c.json({ bills: enrichedBills })
})

// POST /api/homes/:homeId/bills - Create and split a bill
app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()
  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Request body must be an object' }, 400)
  }

  const record = body as Record<string, unknown>
  const totalCents = record.totalCents

  if (typeof totalCents !== 'number' || !Number.isInteger(totalCents) || totalCents <= 0) {
    return c.json({ error: 'Total cents must be a positive whole number' }, 422)
  }

  const title =
    typeof record.title === 'string' && record.title.trim() !== '' ? record.title.trim() : 'Bill'

  // Fetch all members in order added
  const membersResult = await c.env.DB.prepare(
    'SELECT id, name FROM members WHERE home_id = ? ORDER BY rowid ASC',
  )
    .bind(homeId)
    .all<MemberRow>()

  const members = membersResult.results
  if (members.length === 0) {
    return c.json({ error: 'Home has no members' }, 422)
  }

  const billId = crypto.randomUUID()
  const memberCount = members.length
  const baseShare = Math.floor(totalCents / memberCount)
  const remainder = totalCents % memberCount

  const shares: Array<{
    id: string
    memberId: string
    amountCents: number
    paidAt: string | null
  }> = []

  const now = new Date().toISOString()
  const statements: D1PreparedStatement[] = []

  statements.push(
    c.env.DB.prepare(
      'INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(billId, homeId, title, totalCents, now),
  )

  for (let i = 0; i < memberCount; i++) {
    const member = members[i]
    if (!member) continue
    const shareId = crypto.randomUUID()
    const amountCents = baseShare + (i < remainder ? 1 : 0)

    shares.push({
      id: shareId,
      memberId: member.id,
      amountCents,
      paidAt: null,
    })

    statements.push(
      c.env.DB.prepare(
        'INSERT INTO shares (id, bill_id, member_id, amount_cents, paid_at, idempotency_key) VALUES (?, ?, ?, ?, NULL, NULL)',
      ).bind(shareId, billId, member.id, amountCents),
    )
  }

  await c.env.DB.batch(statements)

  return c.json(
    {
      id: billId,
      homeId,
      title,
      totalCents,
      shares,
    },
    201,
  )
})

// POST /api/bills/:billId/shares/:shareId/pay - Pay a share idempotently
app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')
  const idempotencyKey = c.req.header('Idempotency-Key')

  if (!idempotencyKey || idempotencyKey.trim() === '') {
    return c.json({ error: 'Idempotency-Key header is required' }, 400)
  }

  const bill = await c.env.DB.prepare('SELECT id FROM bills WHERE id = ?').bind(billId).first()
  if (!bill) {
    return c.json({ error: 'Bill not found' }, 404)
  }

  const share = await c.env.DB.prepare(
    'SELECT id, bill_id, member_id, amount_cents, paid_at, idempotency_key FROM shares WHERE id = ? AND bill_id = ?',
  )
    .bind(shareId, billId)
    .first<ShareRow>()

  if (!share) {
    return c.json({ error: 'Share not found' }, 404)
  }

  // Already paid
  if (share.paid_at !== null) {
    if (share.idempotency_key === idempotencyKey) {
      return c.json({
        id: share.id,
        memberId: share.member_id,
        amountCents: share.amount_cents,
        paidAt: share.paid_at,
      })
    }
    return c.json({ error: 'Share already paid with a different key' }, 409)
  }

  // Attempt atomic update
  const paidAt = new Date().toISOString()
  const updateResult = await c.env.DB.prepare(
    'UPDATE shares SET paid_at = ?, idempotency_key = ? WHERE id = ? AND bill_id = ? AND paid_at IS NULL',
  )
    .bind(paidAt, idempotencyKey, shareId, billId)
    .run()

  if (updateResult.meta.changes > 0) {
    return c.json({
      id: share.id,
      memberId: share.member_id,
      amountCents: share.amount_cents,
      paidAt,
    })
  }

  // Race condition: another request just updated it
  const reloaded = await c.env.DB.prepare(
    'SELECT id, bill_id, member_id, amount_cents, paid_at, idempotency_key FROM shares WHERE id = ? AND bill_id = ?',
  )
    .bind(shareId, billId)
    .first<ShareRow>()

  if (reloaded && reloaded.idempotency_key === idempotencyKey) {
    return c.json({
      id: reloaded.id,
      memberId: reloaded.member_id,
      amountCents: reloaded.amount_cents,
      paidAt: reloaded.paid_at,
    })
  }

  return c.json({ error: 'Share already paid with a different key' }, 409)
})

// GET /api/homes/:homeId/balances - Calculate outstanding balances for members in order added
app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()
  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const query = `
    SELECT 
      m.id AS memberId,
      m.name AS name,
      COALESCE(
        (
          SELECT SUM(s.amount_cents) 
          FROM shares s 
          JOIN bills b ON s.bill_id = b.id 
          WHERE s.member_id = m.id 
            AND b.home_id = m.home_id 
            AND s.paid_at IS NULL
        ), 
        0
      ) AS outstandingCents
    FROM members m
    WHERE m.home_id = ?
    ORDER BY m.rowid ASC
  `

  const result = await c.env.DB.prepare(query)
    .bind(homeId)
    .all<{ memberId: string; name: string; outstandingCents: number }>()

  return c.json({ balances: result.results })
})

export default app
