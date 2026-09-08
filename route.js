import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'

// MongoDB connection singleton
let client
let db

async function connectToMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME || 'bingo_sorteio_db')
  }
  return db
}

function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

// Bingo helper functions
function getLetterForNumber(num) {
  if (num >= 1 && num <= 15) return 'B'
  if (num >= 16 && num <= 30) return 'I'
  if (num >= 31 && num <= 45) return 'N'
  if (num >= 46 && num <= 60) return 'G'
  if (num >= 61 && num <= 75) return 'O'
  return 'B'
}

function getRandomNumbers(min, max, count) {
  const nums = new Set()
  while (nums.size < count) {
    const val = Math.floor(Math.random() * (max - min + 1)) + min
    nums.add(val)
  }
  return Array.from(nums)
}

function generateStandardBingoCard(cardNumber = 1) {
  const bCol = getRandomNumbers(1, 15, 5)
  const iCol = getRandomNumbers(16, 30, 5)
  const nCol = getRandomNumbers(31, 45, 4) // Middle is FREE / 0
  const gCol = getRandomNumbers(46, 60, 5)
  const oCol = getRandomNumbers(61, 75, 5)

  // Construct 5x5 grid [row][col]
  const grid = [
    [bCol[0], iCol[0], nCol[0], gCol[0], oCol[0]],
    [bCol[1], iCol[1], nCol[1], gCol[1], oCol[1]],
    [bCol[2], iCol[2], 0,       gCol[2], oCol[2]], // 0 represents FREE
    [bCol[3], iCol[3], nCol[2], gCol[3], oCol[3]],
    [bCol[4], iCol[4], nCol[3], gCol[4], oCol[4]],
  ]

  const marked = [
    [false, false, false, false, false],
    [false, false, false, false, false],
    [false, false, true,  false, false], // Center FREE is marked
    [false, false, false, false, false],
    [false, false, false, false, false],
  ]

  const randomDigits = Math.floor(10000 + Math.random() * 90000)
  const cardCode = `BR-${randomDigits}`

  return {
    id: uuidv4(),
    code: cardCode,
    grid,
    marked,
    autoMarked: true,
    price: 5.0,
    status: 'active',
    createdAt: new Date()
  }
}

// Check winning patterns on a card given marked cells
function evaluateCardWin(grid, marked) {
  let isBingo = true
  let completedLines = 0
  let hasHorizontal = false
  let hasVertical = false
  let hasDiagonal = false
  let hasFourCorners = false

  // Check 5 horizontal rows
  for (let r = 0; r < 5; r++) {
    let rowComplete = true
    for (let c = 0; c < 5; c++) {
      if (!marked[r][c]) {
        rowComplete = false
        isBingo = false
      }
    }
    if (rowComplete) {
      completedLines++
      hasHorizontal = true
    }
  }

  // Check 5 vertical cols
  for (let c = 0; c < 5; c++) {
    let colComplete = true
    for (let r = 0; r < 5; r++) {
      if (!marked[r][c]) {
        colComplete = false
      }
    }
    if (colComplete) {
      completedLines++
      hasVertical = true
    }
  }

  // Check Diagonals
  let diag1 = true
  let diag2 = true
  for (let i = 0; i < 5; i++) {
    if (!marked[i][i]) diag1 = false
    if (!marked[i][4 - i]) diag2 = false
  }
  if (diag1) {
    completedLines++
    hasDiagonal = true
  }
  if (diag2) {
    completedLines++
    hasDiagonal = true
  }

  // 4 corners
  if (marked[0][0] && marked[0][4] && marked[4][0] && marked[4][4]) {
    hasFourCorners = true
  }

  // Count total marked numbers
  let totalMarked = 0
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (marked[r][c]) totalMarked++
    }
  }

  return {
    isBingo: isBingo || totalMarked === 25,
    completedLines,
    hasHorizontal,
    hasVertical,
    hasDiagonal,
    hasFourCorners,
    totalMarked,
    remainingToBingo: 25 - totalMarked
  }
}

// Seed helper
async function ensureSeeded(database) {
  const usersCol = database.collection('users')
  const roundsCol = database.collection('rounds')
  const cardsCol = database.collection('cards')
  const rankingCol = database.collection('ranking')
  const notifsCol = database.collection('notifications')
  const txCol = database.collection('transactions')

  const existingUser = await usersCol.findOne({ id: 'user_demo_1' })
  if (!existingUser) {
    const initialUsers = [
      {
        id: 'user_demo_1',
        name: 'Carlos Oliveira',
        username: 'bingo_master',
        email: 'carlos.bingo@email.com',
        avatar: '👑',
        balance: 50.00,
        totalWon: 1250.00,
        totalBingos: 4,
        isVip: true,
        vipTier: 'Ouro',
        status: 'active',
        pixKey: 'carlos.bingo@email.com',
        pixKeyType: 'EMAIL',
        createdAt: new Date()
      },
      {
        id: 'user_2',
        name: 'Mariana Silva',
        username: 'mari_sortuda',
        email: 'mariana.silva@email.com',
        avatar: '🥇',
        balance: 340.00,
        totalWon: 14850.00,
        totalBingos: 28,
        isVip: true,
        vipTier: 'Diamante',
        status: 'active',
        pixKey: 'mariana.silva@email.com',
        pixKeyType: 'EMAIL',
        createdAt: new Date(Date.now() - 86400000 * 10)
      },
      {
        id: 'user_3',
        name: 'Rodrigo Costa',
        username: 'rodrigo_bingo',
        email: 'rodrigo.costa@email.com',
        avatar: '🥈',
        balance: 180.00,
        totalWon: 11200.00,
        totalBingos: 21,
        isVip: true,
        vipTier: 'Platina',
        status: 'active',
        pixKey: '11987654321',
        pixKeyType: 'TELEFONE',
        createdAt: new Date(Date.now() - 86400000 * 8)
      },
      {
        id: 'user_4',
        name: 'Beatriz Lima',
        username: 'bia_campea',
        email: 'bia.lima@email.com',
        avatar: '🥉',
        balance: 95.00,
        totalWon: 8950.00,
        totalBingos: 17,
        isVip: false,
        vipTier: 'Prata',
        status: 'active',
        pixKey: '12345678900',
        pixKeyType: 'CPF',
        createdAt: new Date(Date.now() - 86400000 * 5)
      },
      {
        id: 'user_5',
        name: 'Lucas Mendes',
        username: 'lucas_jackpot',
        email: 'lucas.mendes@email.com',
        avatar: '🎯',
        balance: 215.00,
        totalWon: 850.00,
        totalBingos: 2,
        isVip: false,
        vipTier: 'Bronze',
        status: 'active',
        pixKey: 'lucas.mendes@email.com',
        pixKeyType: 'EMAIL',
        createdAt: new Date(Date.now() - 86400000 * 3)
      }
    ]
    await usersCol.insertMany(initialUsers)
  }

  let currentRound = await roundsCol.findOne({ status: 'running' })
  if (!currentRound) {
    const initialDrawNumbers = [12, 27, 41, 55, 68, 7, 19, 36, 52, 74]
    const drawnNumbers = initialDrawNumbers.map((num, idx) => ({
      number: num,
      letter: getLetterForNumber(num),
      drawnAt: new Date(Date.now() - (10 - idx) * 10000),
      index: idx + 1
    }))

    const roundId = uuidv4()
    currentRound = {
      id: roundId,
      roundNumber: 1042,
      status: 'running',
      drawnNumbers: drawnNumbers,
      allDrawn: initialDrawNumbers,
      lastDrawn: drawnNumbers[drawnNumbers.length - 1],
      nextDrawInSeconds: 25,
      intervalSeconds: 15,
      prizePool: 2500.00,
      participantsCount: 1482,
      winners: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    await roundsCol.insertOne(currentRound)

    // Seed 3 initial cards for user_demo_1
    const initialCards = [1, 2, 3].map(num => {
      const card = generateStandardBingoCard(num)
      card.userId = 'user_demo_1'
      card.roundId = roundId
      card.roundNumber = 1042

      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const val = card.grid[r][c]
          if (val === 0 || initialDrawNumbers.includes(val)) {
            card.marked[r][c] = true
          }
        }
      }
      return card
    })

    await cardsCol.deleteMany({ userId: 'user_demo_1' })
    await cardsCol.insertMany(initialCards)
  }

  // Seed ranking if empty
  const rankCount = await rankingCol.countDocuments()
  if (rankCount === 0) {
    const sampleRankings = [
      { id: '1', rank: 1, name: 'Mariana Silva', username: 'mari_sortuda', avatar: '🥇', totalWon: 14850.00, bingos: 28, winStreak: 5, period: 'all' },
      { id: '2', rank: 2, name: 'Rodrigo Costa', username: 'rodrigo_bingo', avatar: '🥈', totalWon: 11200.00, bingos: 21, winStreak: 3, period: 'all' },
      { id: '3', rank: 3, name: 'Beatriz Lima', username: 'bia_campea', avatar: '🥉', totalWon: 8950.00, bingos: 17, winStreak: 4, period: 'all' },
      { id: '4', rank: 4, name: 'Fernando Dias', username: 'fer_trevo', avatar: '🍀', totalWon: 6400.00, bingos: 12, winStreak: 2, period: 'all' },
      { id: '5', rank: 5, name: 'Carlos Oliveira', username: 'bingo_master', avatar: '👑', totalWon: 1250.00, bingos: 4, winStreak: 1, period: 'all' },
      { id: '6', rank: 6, name: 'Juliana Rocha', username: 'ju_vitoria', avatar: '💎', totalWon: 980.00, bingos: 3, winStreak: 1, period: 'all' },
      { id: '7', rank: 7, name: 'Lucas Mendes', username: 'lucas_jackpot', avatar: '🎯', totalWon: 850.00, bingos: 2, winStreak: 2, period: 'all' },
      
      // Today
      { id: 't1', rank: 1, name: 'Mariana Silva', username: 'mari_sortuda', avatar: '🥇', totalWon: 2500.00, bingos: 2, winStreak: 2, period: 'today' },
      { id: 't2', rank: 2, name: 'Lucas Mendes', username: 'lucas_jackpot', avatar: '🥈', totalWon: 850.00, bingos: 1, winStreak: 1, period: 'today' },
      { id: 't3', rank: 3, name: 'Carlos Oliveira', username: 'bingo_master', avatar: '🥉', totalWon: 450.00, bingos: 1, winStreak: 1, period: 'today' },
      { id: 't4', rank: 4, name: 'Patrícia Gomes', username: 'pati_gold', avatar: '⭐', totalWon: 300.00, bingos: 1, winStreak: 1, period: 'today' },
      
      // Week
      { id: 'w1', rank: 1, name: 'Rodrigo Costa', username: 'rodrigo_bingo', avatar: '🥇', totalWon: 5400.00, bingos: 9, winStreak: 3, period: 'week' },
      { id: 'w2', rank: 2, name: 'Mariana Silva', username: 'mari_sortuda', avatar: '🥈', totalWon: 4800.00, bingos: 8, winStreak: 2, period: 'week' },
      { id: 'w3', rank: 3, name: 'Beatriz Lima', username: 'bia_campea', avatar: '🥉', totalWon: 3600.00, bingos: 6, winStreak: 3, period: 'week' },
      { id: 'w4', rank: 4, name: 'Carlos Oliveira', username: 'bingo_master', avatar: '👑', totalWon: 1250.00, bingos: 4, winStreak: 1, period: 'week' }
    ]
    await rankingCol.insertMany(sampleRankings)
  }

  // Seed sample transactions if empty
  const txCount = await txCol.countDocuments()
  if (txCount === 0) {
    const sampleTxs = [
      {
        id: uuidv4(),
        userId: 'user_demo_1',
        userName: 'Carlos Oliveira',
        type: 'deposit_pix',
        title: 'Recarga Pix',
        amount: 50.00,
        status: 'completed',
        details: 'Depósito via Pix Instantâneo',
        createdAt: new Date(Date.now() - 3600000)
      },
      {
        id: uuidv4(),
        userId: 'user_demo_1',
        userName: 'Carlos Oliveira',
        type: 'purchase',
        title: 'Compra de 3 Cartelas',
        amount: -12.00,
        status: 'completed',
        details: 'Rodada #1042',
        createdAt: new Date(Date.now() - 1800000)
      },
      {
        id: uuidv4(),
        userId: 'user_demo_1',
        userName: 'Carlos Oliveira',
        type: 'prize',
        title: 'Prêmio Quina / Linha',
        amount: 250.00,
        status: 'completed',
        details: 'Rodada #1041 - Linha Horizontal',
        createdAt: new Date(Date.now() - 86400000)
      },
      {
        id: uuidv4(),
        userId: 'user_2',
        userName: 'Mariana Silva',
        type: 'deposit_pix',
        title: 'Recarga Pix',
        amount: 200.00,
        status: 'completed',
        details: 'Depósito via Pix Instantâneo',
        createdAt: new Date(Date.now() - 7200000)
      },
      {
        id: uuidv4(),
        userId: 'user_2',
        userName: 'Mariana Silva',
        type: 'purchase',
        title: 'Compra de 10 Cartelas',
        amount: -30.00,
        status: 'completed',
        details: 'Rodada #1042 - Pacote Mega VIP',
        createdAt: new Date(Date.now() - 3600000)
      },
      {
        id: uuidv4(),
        userId: 'user_3',
        userName: 'Rodrigo Costa',
        type: 'deposit_pix',
        title: 'Recarga Pix',
        amount: 100.00,
        status: 'completed',
        details: 'Depósito via Pix Instantâneo',
        createdAt: new Date(Date.now() - 14400000)
      }
    ]
    await txCol.insertMany(sampleTxs)
  }

  // Seed sample notifications if empty
  const notifCount = await notifsCol.countDocuments()
  if (notifCount === 0) {
    const sampleNotifs = [
      {
        id: uuidv4(),
        userId: 'user_demo_1',
        title: '🎉 Bem-vindo ao Bingo Sorteio!',
        message: 'Você recebeu R$ 50,00 de saldo inicial para jogar e se divertir!',
        type: 'welcome',
        read: false,
        createdAt: new Date()
      },
      {
        id: uuidv4(),
        userId: 'user_demo_1',
        title: '⚡ Rodada Especial #1042 Iniciada!',
        message: 'O Prêmio Acumulado está em R$ 2.500,00. Boa sorte!',
        type: 'game',
        read: false,
        createdAt: new Date(Date.now() - 600000)
      }
    ]
    await notifsCol.insertMany(sampleNotifs)
  }
}

// Route handler
async function handleRoute(request, { params }) {
  const { path = [] } = await params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const database = await connectToMongo()
    await ensureSeeded(database)

    const usersCol = database.collection('users')
    const roundsCol = database.collection('rounds')
    const cardsCol = database.collection('cards')
    const rankingCol = database.collection('ranking')
    const notifsCol = database.collection('notifications')
    const txCol = database.collection('transactions')
    const pixCol = database.collection('pix_orders')

    // Root endpoint
    if ((route === '/' || route === '/root') && method === 'GET') {
      return handleCORS(NextResponse.json({ message: "Bingo Sorteio API Online", status: "ok" }))
    }

    // Seed/Reset endpoint
    if (route === '/seed' && (method === 'GET' || method === 'POST')) {
      await database.collection('users').deleteMany({})
      await database.collection('rounds').deleteMany({})
      await database.collection('cards').deleteMany({})
      await database.collection('ranking').deleteMany({})
      await database.collection('notifications').deleteMany({})
      await database.collection('transactions').deleteMany({})
      await database.collection('pix_orders').deleteMany({})
      await ensureSeeded(database)
      return handleCORS(NextResponse.json({ success: true, message: "Database reseeded successfully" }))
    }

    // ==========================================
    // ADMIN ENDPOINTS
    // ==========================================

    // 1. Admin Metrics & KPIs
    if (route === '/admin/metrics' && method === 'GET') {
      const totalUsers = await usersCol.countDocuments()
      const allUsers = await usersCol.find({}).toArray()
      const totalBalanceInCustody = allUsers.reduce((acc, u) => acc + (u.balance || 0), 0)

      const allTxs = await txCol.find({}).toArray()
      const totalDeposits = allTxs
        .filter(t => t.type === 'deposit_pix' && t.status === 'completed')
        .reduce((acc, t) => acc + (t.amount || 0), 0)
      const totalPurchases = allTxs
        .filter(t => t.type === 'purchase' && t.status === 'completed')
        .reduce((acc, t) => acc + Math.abs(t.amount || 0), 0)
      const totalPrizesPaid = allTxs
        .filter(t => t.type === 'prize' && t.status === 'completed')
        .reduce((acc, t) => acc + (t.amount || 0), 0)
      const totalWithdrawals = allTxs
        .filter(t => t.type === 'withdraw_pix' && t.status === 'completed')
        .reduce((acc, t) => acc + Math.abs(t.amount || 0), 0)

      const netProfit = (totalDeposits + totalPurchases) - (totalPrizesPaid + totalWithdrawals)

      const totalRounds = await roundsCol.countDocuments()
      const activeCardsCount = await cardsCol.countDocuments({ status: 'active' })
      const totalCards = await cardsCol.countDocuments()

      const currentRound = await roundsCol.findOne({ status: 'running' })
      const recentTxs = await txCol.find({}).sort({ createdAt: -1 }).limit(10).toArray()
      const cleanedRecentTxs = recentTxs.map(({ _id, ...t }) => t)

      // Chart series for last 7 days
      const chartData = [
        { day: 'Seg', depositos: 1200, vendas: 650, premios: 450, lucro: 1400 },
        { day: 'Ter', depositos: 1850, vendas: 920, premios: 800, lucro: 1970 },
        { day: 'Qua', depositos: 2400, vendas: 1350, premios: 1200, lucro: 2550 },
        { day: 'Qui', depositos: 3100, vendas: 1780, premios: 1500, lucro: 3380 },
        { day: 'Sex', depositos: 4800, vendas: 2900, premios: 2300, lucro: 5400 },
        { day: 'Sáb', depositos: 6200, vendas: 4100, premios: 3200, lucro: 7100 },
        { day: 'Dom', depositos: 5400, vendas: 3500, premios: 2800, lucro: 6100 },
      ]

      return handleCORS(NextResponse.json({
        metrics: {
          totalUsers,
          totalBalanceInCustody: parseFloat(totalBalanceInCustody.toFixed(2)),
          totalDeposits: parseFloat(totalDeposits.toFixed(2)),
          totalPurchases: parseFloat(totalPurchases.toFixed(2)),
          totalPrizesPaid: parseFloat(totalPrizesPaid.toFixed(2)),
          totalWithdrawals: parseFloat(totalWithdrawals.toFixed(2)),
          netProfit: parseFloat(netProfit.toFixed(2)),
          totalRounds,
          activeCardsCount,
          totalCards
        },
        currentRound: currentRound ? { ...currentRound, _id: undefined } : null,
        recentTransactions: cleanedRecentTxs,
        chartData
      }))
    }

    // 2. Admin Rounds list & control
    if (route === '/admin/rounds' && method === 'GET') {
      const rounds = await roundsCol.find({}).sort({ roundNumber: -1 }).limit(30).toArray()
      const cleaned = rounds.map(({ _id, ...r }) => r)
      return handleCORS(NextResponse.json({ rounds: cleaned }))
    }

    // Force draw specific or next ball
    if (route === '/admin/rounds/force-draw' && method === 'POST') {
      const body = await request.json()
      const { number } = body // optional specific number 1..75

      let currentRound = await roundsCol.findOne({ status: 'running' })
      if (!currentRound) {
        return handleCORS(NextResponse.json({ error: "Nenhuma rodada ativa encontrada" }, { status: 400 }))
      }

      const allDrawn = currentRound.allDrawn || []
      let pickedNumber = parseInt(number, 10)

      if (isNaN(pickedNumber) || pickedNumber < 1 || pickedNumber > 75 || allDrawn.includes(pickedNumber)) {
        // pick random
        const available = []
        for (let i = 1; i <= 75; i++) {
          if (!allDrawn.includes(i)) available.push(i)
        }
        if (available.length === 0) {
          return handleCORS(NextResponse.json({ error: "Todos os números já foram sorteados" }, { status: 400 }))
        }
        pickedNumber = available[Math.floor(Math.random() * available.length)]
      }

      const letter = getLetterForNumber(pickedNumber)
      const drawEntry = {
        number: pickedNumber,
        letter,
        drawnAt: new Date(),
        index: allDrawn.length + 1
      }

      const updatedAllDrawn = [...allDrawn, pickedNumber]
      const updatedDrawnNumbers = [...(currentRound.drawnNumbers || []), drawEntry]

      await roundsCol.updateOne(
        { id: currentRound.id },
        {
          $set: {
            allDrawn: updatedAllDrawn,
            drawnNumbers: updatedDrawnNumbers,
            lastDrawn: drawEntry,
            updatedAt: new Date()
          }
        }
      )

      // Auto update all active cards in the round
      const activeCards = await cardsCol.find({ roundId: currentRound.id }).toArray()
      for (const card of activeCards) {
        let cardUpdated = false
        const marked = card.marked
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (card.grid[r][c] === pickedNumber) {
              marked[r][c] = true
              cardUpdated = true
            }
          }
        }
        if (cardUpdated) {
          const evalResult = evaluateCardWin(card.grid, marked)
          await cardsCol.updateOne(
            { id: card.id },
            { $set: { marked, lastEvaluation: evalResult } }
          )
        }
      }

      return handleCORS(NextResponse.json({
        success: true,
        drawnNumber: drawEntry,
        totalDrawn: updatedAllDrawn.length,
        allDrawn: updatedAllDrawn
      }))
    }

    // Admin Round control (pause / resume / update prize / reset)
    if (route === '/admin/rounds/control' && method === 'POST') {
      const body = await request.json()
      const { action, prizePool } = body

      let currentRound = await roundsCol.findOne({ status: 'running' })

      if (action === 'pause' && currentRound) {
        await roundsCol.updateOne({ id: currentRound.id }, { $set: { isPaused: true } })
        return handleCORS(NextResponse.json({ success: true, message: "Rodada pausada" }))
      }

      if (action === 'resume' && currentRound) {
        await roundsCol.updateOne({ id: currentRound.id }, { $set: { isPaused: false } })
        return handleCORS(NextResponse.json({ success: true, message: "Rodada retomada" }))
      }

      if (action === 'update_prize' && currentRound && prizePool) {
        const newPrize = parseFloat(prizePool)
        await roundsCol.updateOne({ id: currentRound.id }, { $set: { prizePool: newPrize } })
        return handleCORS(NextResponse.json({ success: true, prizePool: newPrize }))
      }

      if (action === 'end_round' && currentRound) {
        await roundsCol.updateOne({ id: currentRound.id }, { $set: { status: 'completed' } })
        return handleCORS(NextResponse.json({ success: true, message: "Rodada finalizada" }))
      }

      return handleCORS(NextResponse.json({ success: true }))
    }

    // 3. Admin Users Management
    if (route === '/admin/users' && method === 'GET') {
      const url = new URL(request.url)
      const q = (url.searchParams.get('q') || '').toLowerCase()

      let filter = {}
      if (q) {
        filter = {
          $or: [
            { name: { $regex: q, $options: 'i' } },
            { username: { $regex: q, $options: 'i' } },
            { email: { $regex: q, $options: 'i' } }
          ]
        }
      }

      const users = await usersCol.find(filter).sort({ createdAt: -1 }).toArray()
      const cleaned = users.map(({ _id, ...u }) => u)
      return handleCORS(NextResponse.json({ users: cleaned }))
    }

    // Admin Adjust User Balance
    if (route === '/admin/users/adjust-balance' && method === 'POST') {
      const body = await request.json()
      const { userId, amount, type = 'credit', reason = 'Ajuste Administrativo' } = body

      const targetUser = await usersCol.findOne({ id: userId })
      if (!targetUser) {
        return handleCORS(NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 }))
      }

      const delta = parseFloat(amount)
      if (isNaN(delta) || delta <= 0) {
        return handleCORS(NextResponse.json({ error: "Valor inválido" }, { status: 400 }))
      }

      const finalAmount = type === 'credit' ? delta : -delta
      const newBalance = parseFloat(Math.max(0, targetUser.balance + finalAmount).toFixed(2))

      await usersCol.updateOne({ id: userId }, { $set: { balance: newBalance } })

      // Audit transaction
      await txCol.insertOne({
        id: uuidv4(),
        userId,
        userName: targetUser.name,
        type: type === 'credit' ? 'admin_credit' : 'admin_debit',
        title: type === 'credit' ? 'Crédito Administrativo' : 'Débito Administrativo',
        amount: finalAmount,
        status: 'completed',
        details: reason,
        createdAt: new Date()
      })

      // Add Notification
      await notifsCol.insertOne({
        id: uuidv4(),
        userId,
        title: type === 'credit' ? '💵 Saldo Creditado pelo Suporte' : '⚠️ Débito Administrativo',
        message: `${type === 'credit' ? 'Adicionado' : 'Debitado'}: R$ ${delta.toFixed(2)} (${reason})`,
        type: 'admin',
        read: false,
        createdAt: new Date()
      })

      return handleCORS(NextResponse.json({
        success: true,
        newBalance,
        message: `Saldo atualizado com sucesso para R$ ${newBalance.toFixed(2)}`
      }))
    }

    // Toggle User Status
    if (route === '/admin/users/toggle-status' && method === 'POST') {
      const body = await request.json()
      const { userId, status } = body

      await usersCol.updateOne({ id: userId }, { $set: { status } })
      return handleCORS(NextResponse.json({ success: true, status }))
    }

    // 4. Admin Transactions List
    if (route === '/admin/transactions' && method === 'GET') {
      const url = new URL(request.url)
      const type = url.searchParams.get('type') || 'all'

      let filter = {}
      if (type !== 'all') {
        filter.type = type
      }

      const txs = await txCol.find(filter).sort({ createdAt: -1 }).limit(100).toArray()
      const cleaned = txs.map(({ _id, ...t }) => t)
      return handleCORS(NextResponse.json({ transactions: cleaned }))
    }

    // 5. Admin Cards List
    if (route === '/admin/cards' && method === 'GET') {
      const cards = await cardsCol.find({}).sort({ createdAt: -1 }).limit(50).toArray()
      const cleaned = cards.map(({ _id, ...c }) => c)
      return handleCORS(NextResponse.json({ cards: cleaned }))
    }

    // 6. Admin Pix Orders
    if (route === '/admin/pix-orders' && method === 'GET') {
      const orders = await pixCol.find({}).sort({ createdAt: -1 }).limit(50).toArray()
      const cleaned = orders.map(({ _id, ...o }) => o)
      return handleCORS(NextResponse.json({ orders: cleaned }))
    }

    // 7. Admin Broadcast Notification
    if (route === '/admin/broadcast' && method === 'POST') {
      const body = await request.json()
      const { title, message, type = 'broadcast' } = body

      const allUsers = await usersCol.find({}).toArray()
      const notifs = allUsers.map(u => ({
        id: uuidv4(),
        userId: u.id,
        title: title || '📢 Mensagem da Administração',
        message: message || 'Aviso importante aos jogadores.',
        type,
        read: false,
        createdAt: new Date()
      }))

      if (notifs.length > 0) {
        await notifsCol.insertMany(notifs)
      }

      return handleCORS(NextResponse.json({
        success: true,
        sentCount: notifs.length,
        message: `Mensagem enviada para ${notifs.length} usuários`
      }))
    }

    // ==========================================
    // STANDARD USER ENDPOINTS
    // ==========================================

    // 1. User & Profile Endpoints
    if (route === '/auth/me' && method === 'GET') {
      const user = await usersCol.findOne({ id: 'user_demo_1' })
      if (!user) {
        return handleCORS(NextResponse.json({ error: "User not found" }, { status: 404 }))
      }
      const { _id, ...cleanUser } = user
      return handleCORS(NextResponse.json(cleanUser))
    }

    if (route === '/auth/profile' && method === 'POST') {
      const body = await request.json()
      const updateData = {}
      if (body.name) updateData.name = body.name
      if (body.avatar) updateData.avatar = body.avatar
      if (body.pixKey) updateData.pixKey = body.pixKey
      if (body.pixKeyType) updateData.pixKeyType = body.pixKeyType

      await usersCol.updateOne({ id: 'user_demo_1' }, { $set: updateData })
      const updated = await usersCol.findOne({ id: 'user_demo_1' })
      const { _id, ...cleanUser } = updated
      return handleCORS(NextResponse.json(cleanUser))
    }

    // 2. Game Round Endpoints
    if (route === '/game/current' && method === 'GET') {
      let currentRound = await roundsCol.findOne({ status: 'running' })
      if (!currentRound) {
        currentRound = await roundsCol.findOne({}, { sort: { createdAt: -1 } })
      }

      const jitter = Math.floor(Math.random() * 7) - 3
      const currentParticipants = Math.max(1200, (currentRound?.participantsCount || 1482) + jitter)

      const { _id, ...cleanRound } = currentRound || {}
      cleanRound.participantsCount = currentParticipants
      return handleCORS(NextResponse.json(cleanRound))
    }

    // Draw next number endpoint
    if (route === '/game/draw-next' && method === 'POST') {
      let currentRound = await roundsCol.findOne({ status: 'running' })
      if (!currentRound) {
        return handleCORS(NextResponse.json({ error: "No active round found" }, { status: 400 }))
      }

      const allDrawn = currentRound.allDrawn || []
      if (allDrawn.length >= 75) {
        await roundsCol.updateOne({ id: currentRound.id }, { $set: { status: 'completed' } })
        return handleCORS(NextResponse.json({ message: "All 75 numbers have been drawn!", completed: true }))
      }

      const available = []
      for (let i = 1; i <= 75; i++) {
        if (!allDrawn.includes(i)) available.push(i)
      }

      const pickedNumber = available[Math.floor(Math.random() * available.length)]
      const letter = getLetterForNumber(pickedNumber)
      const drawEntry = {
        number: pickedNumber,
        letter,
        drawnAt: new Date(),
        index: allDrawn.length + 1
      }

      const updatedAllDrawn = [...allDrawn, pickedNumber]
      const updatedDrawnNumbers = [...(currentRound.drawnNumbers || []), drawEntry]

      await roundsCol.updateOne(
        { id: currentRound.id },
        {
          $set: {
            allDrawn: updatedAllDrawn,
            drawnNumbers: updatedDrawnNumbers,
            lastDrawn: drawEntry,
            updatedAt: new Date()
          }
        }
      )

      // Auto update active cards for user_demo_1
      const userCards = await cardsCol.find({ userId: 'user_demo_1', roundId: currentRound.id }).toArray()
      for (const card of userCards) {
        let cardUpdated = false
        const marked = card.marked
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (card.grid[r][c] === pickedNumber) {
              marked[r][c] = true
              cardUpdated = true
            }
          }
        }
        if (cardUpdated) {
          const evalResult = evaluateCardWin(card.grid, marked)
          await cardsCol.updateOne(
            { id: card.id },
            { $set: { marked, lastEvaluation: evalResult } }
          )
        }
      }

      let simulatedWinner = null
      if (updatedAllDrawn.length >= 24 && Math.random() < 0.08) {
        const botNames = ['Fernanda Souza', 'Rafael Martins', 'Camila Duarte', 'Thiago Barbosa']
        const winnerName = botNames[Math.floor(Math.random() * botNames.length)]
        simulatedWinner = {
          winnerName,
          prize: currentRound.prizePool || 2500.0,
          pattern: 'BINGO (Cartela Cheia)',
          ballCount: updatedAllDrawn.length,
          time: new Date()
        }
      }

      return handleCORS(NextResponse.json({
        success: true,
        drawnNumber: drawEntry,
        totalDrawn: updatedAllDrawn.length,
        allDrawn: updatedAllDrawn,
        simulatedWinner
      }))
    }

    // Start New Round
    if (route === '/game/new-round' && method === 'POST') {
      const lastRound = await roundsCol.findOne({}, { sort: { roundNumber: -1 } })
      const newRoundNumber = (lastRound?.roundNumber || 1042) + 1
      const roundId = uuidv4()

      await roundsCol.updateMany({ status: 'running' }, { $set: { status: 'completed' } })

      const newRound = {
        id: roundId,
        roundNumber: newRoundNumber,
        status: 'running',
        drawnNumbers: [],
        allDrawn: [],
        lastDrawn: null,
        nextDrawInSeconds: 20,
        intervalSeconds: 15,
        prizePool: 2500.00 + Math.floor(Math.random() * 500),
        participantsCount: 1450 + Math.floor(Math.random() * 100),
        winners: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }

      await roundsCol.insertOne(newRound)

      const newCards = [1, 2].map(num => {
        const c = generateStandardBingoCard(num)
        c.userId = 'user_demo_1'
        c.roundId = roundId
        c.roundNumber = newRoundNumber
        return c
      })
      await cardsCol.insertMany(newCards)

      const { _id, ...cleanRound } = newRound
      return handleCORS(NextResponse.json({ success: true, round: cleanRound }))
    }

    // 3. Bingo Cards Endpoints
    if (route === '/cards/generate' && (method === 'GET' || method === 'POST')) {
      const url = new URL(request.url)
      const count = parseInt(url.searchParams.get('count') || '3', 10)
      const luckyNumber = parseInt(url.searchParams.get('luckyNumber') || '0', 10)

      const cards = []
      for (let i = 1; i <= Math.min(count, 10); i++) {
        const card = generateStandardBingoCard(i)
        if (luckyNumber >= 1 && luckyNumber <= 75) {
          const colIdx = luckyNumber <= 15 ? 0 : luckyNumber <= 30 ? 1 : luckyNumber <= 45 ? 2 : luckyNumber <= 60 ? 3 : 4
          const rowIdx = (colIdx === 2) ? 0 : 0
          card.grid[rowIdx][colIdx] = luckyNumber
        }
        cards.push(card)
      }

      return handleCORS(NextResponse.json({ cards }))
    }

    if (route === '/cards/my-cards' && method === 'GET') {
      const currentRound = await roundsCol.findOne({ status: 'running' })
      const roundId = currentRound?.id

      const cards = await cardsCol.find({ userId: 'user_demo_1' }).toArray()
      const allDrawn = currentRound?.allDrawn || []

      const enrichedCards = cards.map(c => {
        const { _id, ...cardData } = c
        const currentMarked = cardData.marked.map((row, r) =>
          row.map((val, c) => {
            const num = cardData.grid[r][c]
            return num === 0 || allDrawn.includes(num) || val
          })
        )
        const evaluation = evaluateCardWin(cardData.grid, currentMarked)
        return {
          ...cardData,
          marked: currentMarked,
          evaluation
        }
      })

      return handleCORS(NextResponse.json({ cards: enrichedCards, currentRoundId: roundId }))
    }

    if (route === '/cards/buy' && method === 'POST') {
      const body = await request.json()
      const { count = 1, packageId = 'custom', customCards = [] } = body

      const user = await usersCol.findOne({ id: 'user_demo_1' })
      if (!user) {
        return handleCORS(NextResponse.json({ error: "User not found" }, { status: 404 }))
      }

      let price = 5.00 * count
      if (count === 3) price = 12.00
      if (count === 5) price = 18.00
      if (count === 10) price = 30.00

      if (user.balance < price) {
        return handleCORS(NextResponse.json({
          error: "Saldo insuficiente na carteira. Por favor, recarregue via Pix.",
          currentBalance: user.balance,
          required: price
        }, { status: 400 }))
      }

      const currentRound = await roundsCol.findOne({ status: 'running' })
      const roundId = currentRound?.id || 'round_default'
      const roundNumber = currentRound?.roundNumber || 1042
      const allDrawn = currentRound?.allDrawn || []

      const newCards = []
      for (let i = 0; i < count; i++) {
        const cardData = customCards[i] ? customCards[i] : generateStandardBingoCard(i + 1)
        cardData.userId = 'user_demo_1'
        cardData.roundId = roundId
        cardData.roundNumber = roundNumber
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            const val = cardData.grid[r][c]
            if (val === 0 || allDrawn.includes(val)) {
              cardData.marked[r][c] = true
            }
          }
        }
        newCards.push(cardData)
      }

      await cardsCol.insertMany(newCards)

      const newBalance = parseFloat((user.balance - price).toFixed(2))
      await usersCol.updateOne({ id: 'user_demo_1' }, { $set: { balance: newBalance } })

      const tx = {
        id: uuidv4(),
        userId: 'user_demo_1',
        userName: user.name,
        type: 'purchase',
        title: `Compra de ${count} Cartela${count > 1 ? 's' : ''}`,
        amount: -price,
        status: 'completed',
        details: `Rodada #${roundNumber} (${count}x)`,
        createdAt: new Date()
      }
      await txCol.insertOne(tx)

      if (currentRound) {
        const poolIncrease = price * 0.7
        await roundsCol.updateOne(
          { id: currentRound.id },
          { $inc: { prizePool: poolIncrease } }
        )
      }

      await notifsCol.insertOne({
        id: uuidv4(),
        userId: 'user_demo_1',
        title: '🎟️ Cartelas Compradas!',
        message: `Você adquiriu ${count} cartela(s) para a Rodada #${roundNumber}. Boa sorte!`,
        type: 'purchase',
        read: false,
        createdAt: new Date()
      })

      const cleanedCards = newCards.map(({ _id, ...c }) => c)

      return handleCORS(NextResponse.json({
        success: true,
        purchasedCount: count,
        pricePaid: price,
        newBalance,
        cards: cleanedCards
      }))
    }

    if (route === '/cards/mark' && method === 'POST') {
      const body = await request.json()
      const { cardId, row, col } = body

      const card = await cardsCol.findOne({ id: cardId, userId: 'user_demo_1' })
      if (!card) {
        return handleCORS(NextResponse.json({ error: "Card not found" }, { status: 404 }))
      }

      if (row === 2 && col === 2) {
        return handleCORS(NextResponse.json({ success: true, marked: card.marked }))
      }

      const marked = card.marked
      marked[row][col] = !marked[row][col]

      const evaluation = evaluateCardWin(card.grid, marked)
      await cardsCol.updateOne({ id: cardId }, { $set: { marked, lastEvaluation: evaluation } })

      return handleCORS(NextResponse.json({ success: true, marked, evaluation }))
    }

    if (route === '/cards/claim-bingo' && method === 'POST') {
      const body = await request.json()
      const { cardId } = body

      const card = await cardsCol.findOne({ id: cardId, userId: 'user_demo_1' })
      if (!card) {
        return handleCORS(NextResponse.json({ error: "Card not found" }, { status: 404 }))
      }

      const currentRound = await roundsCol.findOne({ status: 'running' })
      const allDrawn = currentRound?.allDrawn || []

      let isLegitBingo = true
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const num = card.grid[r][c]
          if (num !== 0 && !allDrawn.includes(num)) {
            isLegitBingo = false
          }
        }
      }

      const evalResult = evaluateCardWin(card.grid, card.marked)

      let prizeAmount = 250.00
      let winType = 'LINHA'
      if (evalResult.isBingo || isLegitBingo) {
        prizeAmount = currentRound?.prizePool || 2500.00
        winType = 'BINGO'
      }

      const user = await usersCol.findOne({ id: 'user_demo_1' })
      const newBalance = parseFloat(((user?.balance || 0) + prizeAmount).toFixed(2))
      const newTotalWon = parseFloat(((user?.totalWon || 0) + prizeAmount).toFixed(2))
      const newTotalBingos = (user?.totalBingos || 0) + (winType === 'BINGO' ? 1 : 0)

      await usersCol.updateOne(
        { id: 'user_demo_1' },
        {
          $set: {
            balance: newBalance,
            totalWon: newTotalWon,
            totalBingos: newTotalBingos
          }
        }
      )

      await cardsCol.updateOne({ id: cardId }, { $set: { status: `won_${winType.toLowerCase()}` } })

      await txCol.insertOne({
        id: uuidv4(),
        userId: 'user_demo_1',
        userName: user.name,
        type: 'prize',
        title: `🏆 PRÊMIO ${winType}!`,
        amount: prizeAmount,
        status: 'completed',
        details: `Rodada #${currentRound?.roundNumber || 1042} - Cartela ${card.code}`,
        createdAt: new Date()
      })

      await notifsCol.insertOne({
        id: uuidv4(),
        userId: 'user_demo_1',
        title: `🎉 PARABÉNS! VOCÊ GANHOU ${winType}!`,
        message: `R$ ${prizeAmount.toFixed(2)} foram creditados instantaneamente na sua carteira!`,
        type: 'prize',
        read: false,
        createdAt: new Date()
      })

      await rankingCol.updateOne(
        { username: 'bingo_master', period: 'today' },
        { $inc: { totalWon: prizeAmount, bingos: 1 } },
        { upsert: true }
      )

      return handleCORS(NextResponse.json({
        success: true,
        winType,
        prizeAmount,
        newBalance,
        message: `Parabéns! Você ganhou R$ ${prizeAmount.toFixed(2)}!`
      }))
    }

    // 4. Wallet & Pix Endpoints
    if (route === '/wallet/transactions' && method === 'GET') {
      const txs = await txCol.find({ userId: 'user_demo_1' }).sort({ createdAt: -1 }).limit(50).toArray()
      const cleaned = txs.map(({ _id, ...t }) => t)
      return handleCORS(NextResponse.json({ transactions: cleaned }))
    }

    if (route === '/pix/create' && method === 'POST') {
      const body = await request.json()
      const { amount } = body

      const depositAmount = parseFloat(amount)
      if (isNaN(depositAmount) || depositAmount < 1) {
        return handleCORS(NextResponse.json({ error: "Valor de depósito inválido (mínimo R$ 1,00)" }, { status: 400 }))
      }

      const txid = `PIX${Date.now()}${Math.floor(Math.random() * 1000)}`
      const orderId = uuidv4()
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

      const copiaECola = `00020126580014BR.GOV.BCB.PIX0136bingo-sorteio-pix-${orderId.substring(0, 8)}520400005303986540${depositAmount.toFixed(2)}5802BR5913BINGO SORTEIO6009SAO PAULO62070503***6304`

      const order = {
        id: orderId,
        txid,
        userId: 'user_demo_1',
        userName: 'Carlos Oliveira',
        amount: depositAmount,
        copiaECola,
        status: 'pending',
        expiresAt,
        createdAt: new Date()
      }

      await pixCol.insertOne(order)

      return handleCORS(NextResponse.json({
        success: true,
        orderId,
        txid,
        amount: depositAmount,
        copiaECola,
        expiresAt
      }))
    }

    if ((route === '/pix/webhook' || route === '/pix/simulate') && method === 'POST') {
      const body = await request.json()
      const { orderId, txid, amount } = body

      let order = null
      if (orderId) order = await pixCol.findOne({ id: orderId })
      else if (txid) order = await pixCol.findOne({ txid })

      const creditAmount = order ? order.amount : parseFloat(amount || 50.0)
      const targetUserId = order?.userId || 'user_demo_1'

      if (order) {
        await pixCol.updateOne({ id: order.id }, { $set: { status: 'completed', paidAt: new Date() } })
      }

      const user = await usersCol.findOne({ id: targetUserId })
      const newBalance = parseFloat(((user?.balance || 0) + creditAmount).toFixed(2))
      await usersCol.updateOne({ id: targetUserId }, { $set: { balance: newBalance } })

      const tx = {
        id: uuidv4(),
        userId: targetUserId,
        userName: user?.name || 'Carlos Oliveira',
        type: 'deposit_pix',
        title: 'Recarga Pix Confirmada',
        amount: creditAmount,
        status: 'completed',
        details: `Depósito via Pix Instantâneo (TxID: ${txid || order?.txid || 'SIMULADO'})`,
        createdAt: new Date()
      }
      await txCol.insertOne(tx)

      await notifsCol.insertOne({
        id: uuidv4(),
        userId: targetUserId,
        title: '💰 Depósito Pix Confirmado!',
        message: `R$ ${creditAmount.toFixed(2)} foram adicionados com sucesso à sua carteira!`,
        type: 'deposit',
        read: false,
        createdAt: new Date()
      })

      return handleCORS(NextResponse.json({
        success: true,
        credited: creditAmount,
        newBalance,
        message: "Pagamento Pix aprovado instantaneamente!"
      }))
    }

    if (route === '/wallet/withdraw' && method === 'POST') {
      const body = await request.json()
      const { amount, pixKey, pixKeyType } = body

      const withdrawAmount = parseFloat(amount)
      if (isNaN(withdrawAmount) || withdrawAmount < 10) {
        return handleCORS(NextResponse.json({ error: "Valor mínimo de saque é R$ 10,00" }, { status: 400 }))
      }

      const user = await usersCol.findOne({ id: 'user_demo_1' })
      if (!user || user.balance < withdrawAmount) {
        return handleCORS(NextResponse.json({ error: "Saldo insuficiente para saque." }, { status: 400 }))
      }

      const newBalance = parseFloat((user.balance - withdrawAmount).toFixed(2))
      await usersCol.updateOne({ id: 'user_demo_1' }, { $set: { balance: newBalance } })

      const tx = {
        id: uuidv4(),
        userId: 'user_demo_1',
        userName: user.name,
        type: 'withdraw_pix',
        title: 'Saque Pix Solicitado',
        amount: -withdrawAmount,
        status: 'completed',
        details: `Chave Pix: ${pixKey} (${pixKeyType || 'CPF'})`,
        createdAt: new Date()
      }
      await txCol.insertOne(tx)

      await notifsCol.insertOne({
        id: uuidv4(),
        userId: 'user_demo_1',
        title: '💸 Saque Pix Enviado!',
        message: `O valor de R$ ${withdrawAmount.toFixed(2)} foi transferido para a chave ${pixKey}.`,
        type: 'withdraw',
        read: false,
        createdAt: new Date()
      })

      return handleCORS(NextResponse.json({
        success: true,
        withdrawn: withdrawAmount,
        newBalance,
        message: "Saque Pix processado com sucesso!"
      }))
    }

    // 5. Ranking Endpoints
    if (route === '/ranking' && method === 'GET') {
      const url = new URL(request.url)
      const period = url.searchParams.get('period') || 'today'

      const leaders = await rankingCol.find({ period }).sort({ totalWon: -1, bingos: -1 }).limit(20).toArray()
      const cleanedLeaders = leaders.map(({ _id, ...l }, idx) => ({ ...l, rank: idx + 1 }))

      return handleCORS(NextResponse.json({
        period,
        ranking: cleanedLeaders
      }))
    }

    // 6. Notifications Endpoints
    if (route === '/notifications' && method === 'GET') {
      const notifs = await notifsCol.find({ userId: 'user_demo_1' }).sort({ createdAt: -1 }).limit(30).toArray()
      const cleaned = notifs.map(({ _id, ...n }) => n)
      const unreadCount = cleaned.filter(n => !n.read).length

      return handleCORS(NextResponse.json({ notifications: cleaned, unreadCount }))
    }

    if (route === '/notifications/read' && method === 'POST') {
      await notifsCol.updateMany({ userId: 'user_demo_1' }, { $set: { read: true } })
      return handleCORS(NextResponse.json({ success: true }))
    }

    return handleCORS(NextResponse.json(
      { error: `Route ${route} not found` },
      { status: 404 }
    ))

  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    ))
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
