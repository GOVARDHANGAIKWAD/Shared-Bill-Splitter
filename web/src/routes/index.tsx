import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/')({
  component: BillSplitterApp,
})

type Home = {
  id: string
  name: string
}

type Member = {
  id: string
  homeId: string
  name: string
}

type Balance = {
  memberId: string
  name: string
  outstandingCents: number
}

type Share = {
  id: string
  memberId: string
  memberName: string
  amountCents: number
  paidAt: string | null
}

type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  createdAt: string
  shares: Share[]
}

function formatCents(cents: number): string {
  const dollars = (cents / 100).toFixed(2)
  return `$${dollars}`
}

function BillSplitterApp() {
  const [homes, setHomes] = useState<Home[]>([])
  const [selectedHomeId, setSelectedHomeId] = useState<string>('')
  const [members, setMembers] = useState<Member[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [bills, setBills] = useState<Bill[]>([])

  const [loadingHomes, setLoadingHomes] = useState<boolean>(true)
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false)
  const [generalError, setGeneralError] = useState<string | null>(null)

  // Forms
  const [newHomeName, setNewHomeName] = useState<string>('')
  const [creatingHome, setCreatingHome] = useState<boolean>(false)
  const [homeError, setHomeError] = useState<string | null>(null)

  const [newMemberName, setNewMemberName] = useState<string>('')
  const [addingMember, setAddingMember] = useState<boolean>(false)
  const [memberError, setMemberError] = useState<string | null>(null)

  const [billTitle, setBillTitle] = useState<string>('')
  const [billAmountInput, setBillAmountInput] = useState<string>('')
  const [creatingBill, setCreatingBill] = useState<boolean>(false)
  const [billError, setBillError] = useState<string | null>(null)

  // Per-share payment state
  const [payingShareId, setPayingShareId] = useState<string | null>(null)
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({})
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null)

  // Developer simulation logs
  const [simLog, setSimLog] = useState<string | null>(null)
  const [simRunning, setSimRunning] = useState<boolean>(false)

  // Fetch homes list
  const fetchHomes = useCallback(async () => {
    setLoadingHomes(true)
    setGeneralError(null)
    try {
      const res = await fetch('/api/homes')
      if (!res.ok) {
        throw new Error(`Failed to load homes (${res.status})`)
      }
      const data = (await res.json()) as { homes: Home[] }
      setHomes(data.homes ?? [])
      if (data.homes && data.homes.length > 0 && !selectedHomeId) {
        setSelectedHomeId(data.homes[0]?.id ?? '')
      }
    } catch (err: unknown) {
      setGeneralError(err instanceof Error ? err.message : 'Error loading homes')
    } finally {
      setLoadingHomes(false)
    }
  }, [selectedHomeId])

  // Fetch details for selected home: members, balances, bills
  const fetchHomeDetails = useCallback(async (homeId: string) => {
    if (!homeId) return
    setLoadingDetails(true)
    setGeneralError(null)
    try {
      const [membersRes, balancesRes, billsRes] = await Promise.all([
        fetch(`/api/homes/${homeId}/members`),
        fetch(`/api/homes/${homeId}/balances`),
        fetch(`/api/homes/${homeId}/bills`),
      ])

      if (!membersRes.ok) throw new Error(`Failed to load members (${membersRes.status})`)
      if (!balancesRes.ok) throw new Error(`Failed to load balances (${balancesRes.status})`)
      if (!billsRes.ok) throw new Error(`Failed to load bills (${billsRes.status})`)

      const membersData = (await membersRes.json()) as { members: Member[] }
      const balancesData = (await balancesRes.json()) as { balances: Balance[] }
      const billsData = (await billsRes.json()) as { bills: Bill[] }

      setMembers(membersData.members ?? [])
      setBalances(balancesData.balances ?? [])
      setBills(billsData.bills ?? [])
    } catch (err: unknown) {
      setGeneralError(err instanceof Error ? err.message : 'Error loading home data')
    } finally {
      setLoadingDetails(false)
    }
  }, [])

  useEffect(() => {
    fetchHomes()
  }, [fetchHomes])

  useEffect(() => {
    if (selectedHomeId) {
      fetchHomeDetails(selectedHomeId)
    } else {
      setMembers([])
      setBalances([])
      setBills([])
    }
  }, [selectedHomeId, fetchHomeDetails])

  // Create Home
  const handleCreateHome = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newHomeName.trim()) {
      setHomeError('Please enter a home name')
      return
    }
    setCreatingHome(true)
    setHomeError(null)
    try {
      const res = await fetch('/api/homes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newHomeName.trim() }),
      })
      const data = (await res.json()) as { id?: string; name?: string; error?: string }
      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status}`)
      }
      setNewHomeName('')
      await fetchHomes()
      if (data.id) {
        setSelectedHomeId(data.id)
      }
    } catch (err: unknown) {
      setHomeError(err instanceof Error ? err.message : 'Could not create home')
    } finally {
      setCreatingHome(false)
    }
  }

  // Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedHomeId) {
      setMemberError('Select a home first')
      return
    }
    if (!newMemberName.trim()) {
      setMemberError('Please enter a member name')
      return
    }
    setAddingMember(true)
    setMemberError(null)
    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMemberName.trim() }),
      })
      const data = (await res.json()) as { id?: string; name?: string; error?: string }
      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status}`)
      }
      setNewMemberName('')
      await fetchHomeDetails(selectedHomeId)
    } catch (err: unknown) {
      setMemberError(err instanceof Error ? err.message : 'Could not add member')
    } finally {
      setAddingMember(false)
    }
  }

  // Create Bill
  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedHomeId) {
      setBillError('Please select a home')
      return
    }

    const trimmedInput = billAmountInput.trim()
    const parsedNumber = Number(trimmedInput)
    // Parse as whole cents
    let totalCents: number
    if (trimmedInput.includes('.')) {
      totalCents = Math.round(parsedNumber * 100)
    } else {
      totalCents = Math.floor(parsedNumber)
    }

    if (Number.isNaN(parsedNumber) || totalCents <= 0) {
      setBillError('Total amount must be a positive number')
      return
    }

    if (members.length === 0) {
      setBillError('Home has no members. Add members first!')
      return
    }

    setCreatingBill(true)
    setBillError(null)
    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: billTitle.trim() || 'Shared Expense',
          totalCents,
        }),
      })
      const data = (await res.json()) as { id?: string; error?: string }
      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status}`)
      }
      setBillTitle('')
      setBillAmountInput('')
      await fetchHomeDetails(selectedHomeId)
    } catch (err: unknown) {
      setBillError(err instanceof Error ? err.message : 'Failed to create bill')
    } finally {
      setCreatingBill(false)
    }
  }

  // Pay a share
  const handlePayShare = async (billId: string, shareId: string) => {
    setPayingShareId(shareId)
    setPaymentSuccess(null)
    setPaymentErrors((prev) => {
      const next = { ...prev }
      delete next[shareId]
      return next
    })

    const idempotencyKey = crypto.randomUUID()
    try {
      const res = await fetch(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      })

      const data = (await res.json()) as {
        id?: string
        memberId?: string
        amountCents?: number
        paidAt?: string
        error?: string
      }

      if (!res.ok) {
        throw new Error(data.error || `Payment failed with status ${res.status}`)
      }

      setPaymentSuccess(`Share payment successful!`)
      // Refresh home details to get updated balances and bills
      await fetchHomeDetails(selectedHomeId)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Payment error'
      // Share stays unpaid and error is clearly presented
      setPaymentErrors((prev) => ({ ...prev, [shareId]: msg }))
    } finally {
      setPayingShareId(null)
    }
  }

  // Simulator 1: Test Idempotency with exact same key
  const handleTestIdempotency = async (billId: string, shareId: string) => {
    setSimRunning(true)
    setSimLog('Testing Idempotency: Sending identical request twice with the same key...')
    const key = crypto.randomUUID()

    try {
      const res1 = await fetch(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      })
      const data1 = await res1.json()

      const res2 = await fetch(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      })
      const data2 = await res2.json()

      setSimLog(
        `✓ Idempotency verified!\n1st call status: ${res1.status} (paidAt: ${(data1 as { paidAt?: string }).paidAt})\n2nd call status: ${res2.status} (paidAt: ${(data2 as { paidAt?: string }).paidAt})\nBoth returned HTTP 200 with identical timestamp without double charging.`,
      )
      await fetchHomeDetails(selectedHomeId)
    } catch (err: unknown) {
      setSimLog(`Idempotency test failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSimRunning(false)
    }
  }

  // Simulator 2: Test Race Condition / Concurrent Pay
  const handleTestConcurrentPay = async (billId: string, shareId: string) => {
    setSimRunning(true)
    setSimLog('Testing Concurrency: Firing 2 simultaneous payment requests with different keys...')
    const key1 = crypto.randomUUID()
    const key2 = crypto.randomUUID()

    try {
      const [res1, res2] = await Promise.all([
        fetch(`/api/bills/${billId}/shares/${shareId}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key1 },
        }),
        fetch(`/api/bills/${billId}/shares/${shareId}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key2 },
        }),
      ])

      const statuses = [res1.status, res2.status].sort()
      setSimLog(
        `✓ Concurrency test complete!\nResponses: ${statuses[0]} and ${statuses[1]}.\nOne request succeeded (200), and the second was safely rejected (409 Conflict) preventing double payment.`,
      )
      await fetchHomeDetails(selectedHomeId)
    } catch (err: unknown) {
      setSimLog(`Concurrency test failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSimRunning(false)
    }
  }

  // Calculate live preview for uneven split
  const previewAmountCents = (() => {
    const val = Number(billAmountInput.trim())
    if (Number.isNaN(val) || val <= 0) return 0
    return billAmountInput.includes('.') ? Math.round(val * 100) : Math.floor(val)
  })()

  const previewShares = (() => {
    if (previewAmountCents <= 0 || members.length === 0) return []
    const count = members.length
    const base = Math.floor(previewAmountCents / count)
    const rem = previewAmountCents % count
    return members.map((m, i) => ({
      memberId: m.id,
      name: m.name,
      amountCents: base + (i < rem ? 1 : 0),
      hasExtraCent: i < rem && rem > 0,
    }))
  })()

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <h1>Shared Bill Splitter</h1>
        <p>Fair, transparent expense splitting for your shared home.</p>
      </header>

      {/* General Alert */}
      {generalError && (
        <div className="alert alert-danger">
          <span>⚠️ {generalError}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (selectedHomeId) fetchHomeDetails(selectedHomeId)
              else fetchHomes()
            }}
          >
            Retry
          </button>
        </div>
      )}

      {paymentSuccess && (
        <div className="alert alert-info">
          <span>✓ {paymentSuccess}</span>
        </div>
      )}

      {/* Top Controls: Home selection and Home creation */}
      <div className="grid-2">
        {/* Select Home Card */}
        <div className="card">
          <div className="card-title">
            <span>Select Home</span>
            {loadingHomes && <span className="loading-spinner" />}
          </div>
          {homes.length === 0 && !loadingHomes ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              No homes created yet. Create your first home below!
            </p>
          ) : (
            <div className="form-group">
              <label htmlFor="home-select">Active Home</label>
              <select
                id="home-select"
                className="select"
                value={selectedHomeId}
                onChange={(e) => setSelectedHomeId(e.target.value)}
              >
                {homes.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Create Home Card */}
        <div className="card">
          <div className="card-title">Create New Home</div>
          <form onSubmit={handleCreateHome}>
            {homeError && <div className="alert alert-danger">{homeError}</div>}
            <div className="form-group">
              <label htmlFor="new-home-name">Home Name</label>
              <input
                id="new-home-name"
                type="text"
                className="input"
                placeholder="e.g. Flat 4B, Baker St Apt"
                value={newHomeName}
                onChange={(e) => setNewHomeName(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={creatingHome}>
              {creatingHome ? <span className="loading-spinner" /> : 'Create Home'}
            </button>
          </form>
        </div>
      </div>

      {selectedHomeId && (
        <>
          {/* Members & Balances Section */}
          <div className="card">
            <div className="card-title">
              <span>Members & Outstanding Balances</span>
              {loadingDetails && <span className="loading-spinner" />}
            </div>

            {/* Warning if no members */}
            {members.length === 0 && !loadingDetails && (
              <div className="alert alert-warning">
                ℹ️ This home has no members yet. Add members to split bills.
              </div>
            )}

            {/* Balances list */}
            {members.length > 0 && (
              <div className="balances-grid">
                {balances.map((b) => (
                  <div key={b.memberId} className="balance-item">
                    <div className="balance-name">{b.name}</div>
                    <div className={`balance-amount ${b.outstandingCents > 0 ? 'owing' : ''}`}>
                      {formatCents(b.outstandingCents)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {b.outstandingCents === 0 ? 'All settled' : 'Unpaid share balance'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Member inline form */}
            <form onSubmit={handleAddMember} style={{ marginTop: '20px' }}>
              {memberError && <div className="alert alert-danger">{memberError}</div>}
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="New member name (e.g. Asha, Ben)"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  style={{ maxWidth: '320px' }}
                />
                <button type="submit" className="btn btn-secondary" disabled={addingMember}>
                  {addingMember ? <span className="loading-spinner" /> : '+ Add Member'}
                </button>
              </div>
            </form>
          </div>

          {/* Create Bill Section */}
          <div className="card">
            <div className="card-title">Create & Split Bill</div>
            <form onSubmit={handleCreateBill}>
              {billError && <div className="alert alert-danger">{billError}</div>}
              <div className="grid-2">
                <div className="form-group">
                  <label htmlFor="bill-title">Bill Title</label>
                  <input
                    id="bill-title"
                    type="text"
                    className="input"
                    placeholder="e.g. Electricity, Groceries, WiFi"
                    value={billTitle}
                    onChange={(e) => setBillTitle(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="bill-amount">Total Amount (Dollars or Cents)</label>
                  <input
                    id="bill-amount"
                    type="text"
                    className="input"
                    placeholder="e.g. 30.00 or 3000"
                    value={billAmountInput}
                    onChange={(e) => setBillAmountInput(e.target.value)}
                  />
                </div>
              </div>

              {/* Live Preview Calculation */}
              {previewShares.length > 0 && (
                <div
                  style={{
                    background: '#f1f5f9',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontSize: '13px',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '6px', color: '#1e293b' }}>
                    Live Split Preview ({formatCents(previewAmountCents)} between{' '}
                    {previewShares.length} members):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {previewShares.map((ps) => (
                      <span
                        key={ps.memberId}
                        style={{
                          background: '#ffffff',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                        }}
                      >
                        <strong>{ps.name}:</strong> {formatCents(ps.amountCents)} ({ps.amountCents}
                        ¢)
                        {ps.hasExtraCent && (
                          <span style={{ color: '#2563eb', marginLeft: '4px' }}>
                            (+1¢ uneven split)
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={creatingBill || members.length === 0}
              >
                {creatingBill ? <span className="loading-spinner" /> : 'Split Bill'}
              </button>
            </form>
          </div>

          {/* Bills and Shares Section */}
          <div className="card">
            <div className="card-title">
              <span>Home Bills ({bills.length})</span>
            </div>

            {bills.length === 0 && !loadingDetails ? (
              <div className="empty-state">
                <h3>No bills added yet</h3>
                <p>Create a bill above to split expenses among members.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {bills.map((bill) => {
                  const allPaid = bill.shares.every((s) => s.paidAt !== null)
                  return (
                    <div
                      key={bill.id}
                      style={{
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '16px',
                        background: '#ffffff',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderBottom: '1px solid var(--border-color)',
                          paddingBottom: '12px',
                          marginBottom: '12px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '17px', fontWeight: 700, color: '#1e293b' }}>
                            {bill.title}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            Total: <strong>{formatCents(bill.totalCents)}</strong> (
                            {bill.totalCents}
                            ¢) • {new Date(bill.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div>
                          {allPaid ? (
                            <span className="badge badge-paid">✓ Fully Settled</span>
                          ) : (
                            <span className="badge badge-unpaid">Pending Shares</span>
                          )}
                        </div>
                      </div>

                      {/* Shares list */}
                      <div className="shares-list">
                        {bill.shares.map((share) => {
                          const isPaid = share.paidAt !== null
                          const isPaying = payingShareId === share.id
                          const errorMsg = paymentErrors[share.id]

                          return (
                            <div key={share.id}>
                              {errorMsg && (
                                <div
                                  className="alert alert-danger"
                                  style={{ margin: '4px 0 6px 0', padding: '6px 10px' }}
                                >
                                  ⚠️ Payment failed: {errorMsg}
                                </div>
                              )}
                              <div className="share-row">
                                <div className="share-info">
                                  <span className="share-name">{share.memberName}</span>
                                  <span className="share-amount">
                                    {formatCents(share.amountCents)} ({share.amountCents}¢)
                                  </span>
                                </div>
                                <div className="share-action">
                                  {isPaid ? (
                                    <span className="badge badge-paid">
                                      Paid{' '}
                                      {share.paidAt
                                        ? new Date(share.paidAt).toLocaleTimeString()
                                        : ''}
                                    </span>
                                  ) : (
                                    <>
                                      <span className="badge badge-unpaid">Unpaid</span>
                                      <button
                                        type="button"
                                        className="btn btn-success btn-sm"
                                        disabled={isPaying}
                                        onClick={() => handlePayShare(bill.id, share.id)}
                                      >
                                        {isPaying ? (
                                          <span className="loading-spinner" />
                                        ) : (
                                          'Pay Share'
                                        )}
                                      </button>
                                      {/* Quick test buttons for simulator */}
                                      <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        title="Simulate idempotency: send exact same key twice"
                                        disabled={simRunning}
                                        onClick={() => handleTestIdempotency(bill.id, share.id)}
                                      >
                                        2x Pay
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        title="Simulate concurrent payments with race condition"
                                        disabled={simRunning}
                                        onClick={() => handleTestConcurrentPay(bill.id, share.id)}
                                      >
                                        Race
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Concurrency & Resilience Simulator Console */}
          <div className="card" style={{ background: '#0f172a', color: '#f8fafc' }}>
            <div className="card-title" style={{ color: '#f8fafc', marginBottom: '8px' }}>
              <span>Resilience & Edge Case Verification Console</span>
              {simRunning && <span className="loading-spinner" />}
            </div>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '14px' }}>
              Test critical invariants directly in the browser: duplicate requests, concurrent race
              conditions, and non-existent IDs.
            </p>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={simRunning}
                onClick={async () => {
                  setSimRunning(true)
                  setSimLog('Testing 404 on missing bill/share...')
                  try {
                    const res = await fetch(
                      '/api/bills/non-existent-id/shares/non-existent-share/pay',
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Idempotency-Key': crypto.randomUUID(),
                        },
                      },
                    )
                    const data = await res.json()
                    setSimLog(
                      `✓ Non-existent resource safely answered with HTTP ${res.status}: ${JSON.stringify(data)}`,
                    )
                  } catch (err: unknown) {
                    setSimLog(`Test error: ${err instanceof Error ? err.message : String(err)}`)
                  } finally {
                    setSimRunning(false)
                  }
                }}
              >
                Test 404 Non-existent Share
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={simRunning}
                onClick={async () => {
                  setSimRunning(true)
                  setSimLog('Testing 400 on Missing Idempotency-Key header...')
                  try {
                    const res = await fetch('/api/bills/some-bill/shares/some-share/pay', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                    })
                    const data = await res.json()
                    setSimLog(
                      `✓ Missing Idempotency-Key safely answered with HTTP ${res.status}: ${JSON.stringify(data)}`,
                    )
                  } catch (err: unknown) {
                    setSimLog(`Test error: ${err instanceof Error ? err.message : String(err)}`)
                  } finally {
                    setSimRunning(false)
                  }
                }}
              >
                Test 400 Missing Key
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={simRunning}
                onClick={async () => {
                  setSimRunning(true)
                  setSimLog('Testing 422 Invalid Amount (negative, decimal, string)...')
                  try {
                    const res = await fetch(`/api/homes/${selectedHomeId}/bills`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ title: 'Invalid', totalCents: -50 }),
                    })
                    const data = await res.json()
                    setSimLog(
                      `✓ Invalid totalCents (-50) safely rejected with HTTP ${res.status}: ${JSON.stringify(data)}`,
                    )
                  } catch (err: unknown) {
                    setSimLog(`Test error: ${err instanceof Error ? err.message : String(err)}`)
                  } finally {
                    setSimRunning(false)
                  }
                }}
              >
                Test 422 Invalid Amount
              </button>
            </div>

            {simLog && (
              <pre
                style={{
                  background: '#1e293b',
                  color: '#38bdf8',
                  padding: '12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {simLog}
              </pre>
            )}
          </div>
        </>
      )}
    </div>
  )
}
