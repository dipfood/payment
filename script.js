// Configuração do Supabase usando variáveis de ambiente
const supabaseUrl = "https://nvrqxhwkcvycxhndhbft.supabase.co"
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52cnF4aHdrY3Z5Y3hobmRoYmZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0ODQ2MzYsImV4cCI6MjA2OTA2MDYzNn0.WJB5zOX6lFuwLAdp7Dw5RW5wPaNBwP5cuxJKaAVMyLE"

// Inicializar cliente Supabase
let supabase = null

// Verificar se o Supabase está disponível
if (typeof window !== "undefined" && window.supabase) {
  try {
    supabase = window.supabase.createClient(supabaseUrl, supabaseKey)
    console.log("✅ Supabase conectado com sucesso")
  } catch (error) {
    console.error("❌ Erro ao conectar com Supabase:", error)
  }
} else {
  console.warn("⚠️ Supabase não está disponível")
}

// Utilitários
const utils = {
  formatCurrency: (value) => {
    return `R$ ${Number.parseFloat(value).toFixed(2).replace(".", ",")}`
  },

  formatDate: (dateString) => {
    return new Date(dateString).toLocaleDateString("pt-BR")
  },

  formatDateTime: (dateString) => {
    const date = new Date(dateString)
    return `${date.toLocaleDateString("pt-BR")} às ${date.toLocaleTimeString("pt-BR")}`
  },

  isOverdue: (dueDate) => {
    return new Date(dueDate) < new Date()
  },

  updateDueDateIfNeeded: async (userId) => {
    if (!supabase) return null

    // Primeiro verificar se precisa fazer reset mensal
    await monthlyReset.checkAndExecuteReset()

    const today = new Date()

    // Se hoje é dia 1º do mês, atualizar vencimento individual (caso não tenha sido feito o reset geral)
    if (today.getDate() === 1) {
      const nextMonth = new Date(today.getFullYear(), today.getMonth(), 10)
      const newDueDate = nextMonth.toISOString().split("T")[0]

      try {
        const { error } = await supabase
          .from("invoices")
          .update({
            due_date: newDueDate,
            status: "pending",
            paid_at: null,
            paid_by: null,
          })
          .eq("user_id", userId)

        if (error) {
          console.error("Erro ao atualizar vencimento:", error)
        }

        return newDueDate
      } catch (error) {
        console.error("Erro ao atualizar vencimento:", error)
      }
    }

    return null
  },
}

// Sistema de reset mensal
const monthlyReset = {
  checkAndExecuteReset: async () => {
    if (!supabase) return false

    const today = new Date()

    // Verificar se é dia 1º do mês
    if (today.getDate() !== 1) return false

    try {
      // Verificar se já foi executado hoje
      const { data: config, error: configError } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "last_reset_date")
        .single()

      if (configError) {
        console.error("Erro ao verificar última data de reset:", configError)
        return false
      }

      const lastResetDate = new Date(config.value)
      const todayString = today.toISOString().split("T")[0]

      // Se já foi executado hoje, não executar novamente
      if (lastResetDate.toISOString().split("T")[0] === todayString) {
        console.log("Reset mensal já foi executado hoje")
        return false
      }

      // Executar reset mensal
      const success = await monthlyReset.executeReset()

      if (success) {
        // Atualizar data do último reset
        await supabase.from("system_config").update({ value: todayString }).eq("key", "last_reset_date")

        console.log("✅ Reset mensal executado com sucesso")
        return true
      }

      return false
    } catch (error) {
      console.error("Erro no reset mensal:", error)
      return false
    }
  },

  executeReset: async () => {
    if (!supabase) return false

    try {
      // Calcular nova data de vencimento (dia 10 do mês atual)
      const today = new Date()
      const newDueDate = new Date(today.getFullYear(), today.getMonth(), 10)
      const dueDateString = newDueDate.toISOString().split("T")[0]

      // Atualizar todas as faturas
      const { error } = await supabase
        .from("invoices")
        .update({
          status: "pending",
          due_date: dueDateString,
          paid_at: null,
          paid_by: null,
          updated_at: new Date().toISOString(),
        })
        .neq("status", "pending") // Só atualizar as que não estão pendentes

      if (error) {
        console.error("Erro ao executar reset mensal:", error)
        return false
      }

      console.log("Reset mensal executado - todas as faturas foram definidas como pendentes")
      return true
    } catch (error) {
      console.error("Erro ao executar reset mensal:", error)
      return false
    }
  },

  // Função para executar reset manual (para admin)
  executeManualReset: async () => {
    if (!supabase) return false

    try {
      const today = new Date()
      const newDueDate = new Date(today.getFullYear(), today.getMonth(), 10)
      const dueDateString = newDueDate.toISOString().split("T")[0]

      const { error } = await supabase
        .from("invoices")
        .update({
          status: "pending",
          due_date: dueDateString,
          paid_at: null,
          paid_by: null,
          updated_at: new Date().toISOString(),
        })
        .gte("id", "00000000-0000-0000-0000-000000000000") // Atualizar todas

      if (error) {
        console.error("Erro ao executar reset manual:", error)
        return false
      }

      // Atualizar data do último reset
      const todayString = today.toISOString().split("T")[0]
      await supabase.from("system_config").update({ value: todayString }).eq("key", "last_reset_date")

      return true
    } catch (error) {
      console.error("Erro ao executar reset manual:", error)
      return false
    }
  },
}

// Gerenciamento de sessão
const sessionManager = {
  login: (user) => {
    const sessionData = {
      userId: user.id,
      username: user.username,
      name: user.name,
      loginTime: new Date().toISOString(),
    }
    localStorage.setItem("userSession", JSON.stringify(sessionData))
  },

  logout: () => {
    localStorage.removeItem("userSession")
    window.location.href = "index.html"
  },

  getSession: () => {
    const session = localStorage.getItem("userSession")
    return session ? JSON.parse(session) : null
  },

  isLoggedIn: () => {
    return !!sessionManager.getSession()
  },
}

// Sistema de autenticação
const auth = {
  login: async (username, password) => {
    if (!supabase) {
      throw new Error("Erro de conexão com o banco de dados")
    }

    try {
      const { data: users, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", username)
        .eq("password", password)
        .single()

      if (error || !users) {
        throw new Error("Usuário ou senha inválidos")
      }

      sessionManager.login(users)
      return users
    } catch (error) {
      console.error("Erro no login:", error)
      throw new Error("Usuário ou senha inválidos")
    }
  },
}

// Sistema de pagamento
const paymentSystem = {
  getUserData: async (userId) => {
    if (!supabase) {
      console.error("Supabase não está disponível")
      return null
    }

    try {
      // Verificar e atualizar vencimento se necessário
      await utils.updateDueDateIfNeeded(userId)

      // Buscar dados do usuário
      const { data: user, error: userError } = await supabase.from("users").select("*").eq("id", userId).single()

      if (userError) {
        console.error("Erro ao buscar usuário:", userError)
        return null
      }

      // Buscar fatura mais recente
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      if (invoiceError) {
        console.error("Erro ao buscar fatura:", invoiceError)
        return null
      }

      // Verificar se está vencido
      let status = invoice.status
      if (status === "pending" && utils.isOverdue(invoice.due_date)) {
        status = "overdue"

        // Atualizar status no banco
        await supabase.from("invoices").update({ status: "overdue" }).eq("id", invoice.id)
      }

      return {
        ...user,
        dueDate: invoice.due_date,
        amount: Number.parseFloat(invoice.amount),
        status: status,
        lastPayment: invoice.paid_at,
        invoiceId: invoice.id,
      }
    } catch (error) {
      console.error("Erro ao buscar dados do usuário:", error)
      return null
    }
  },

  getPaymentLink: async (userId, amount) => {
    if (!supabase) {
      return "https://exemplo.com/pagamento"
    }

    try {
      const { data: config, error } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "payment_link")
        .single()

      if (error) {
        console.error("Erro ao buscar link de pagamento:", error)
        return "https://exemplo.com/pagamento"
      }

      // Substituir placeholders
      let paymentLink = config.value
      paymentLink = paymentLink.replace("{USER_ID}", userId)
      paymentLink = paymentLink.replace("{AMOUNT}", amount)

      return paymentLink
    } catch (error) {
      console.error("Erro ao buscar link de pagamento:", error)
      return "https://exemplo.com/pagamento"
    }
  },

  redirectToPayment: async (userId, amount) => {
    const paymentLink = await paymentSystem.getPaymentLink(userId, amount)
    window.open(paymentLink, "_blank")
  },
}

// Página de Login
const loginPage = {
  init: () => {
    // Verificar se já está logado
    if (sessionManager.isLoggedIn()) {
      window.location.href = "dashboard.html"
      return
    }

    const form = document.getElementById("loginForm")
    const errorMessage = document.getElementById("errorMessage")
    const loginButton = document.getElementById("loginButton")
    const buttonText = loginButton.querySelector(".button-text")
    const loadingSpinner = loginButton.querySelector(".loading-spinner")

    form.addEventListener("submit", async (e) => {
      e.preventDefault()

      const username = document.getElementById("username").value
      const password = document.getElementById("password").value

      // Mostrar loading
      loginButton.disabled = true
      buttonText.style.display = "none"
      loadingSpinner.style.display = "block"
      errorMessage.style.display = "none"

      try {
        await auth.login(username, password)
        window.location.href = "dashboard.html"
      } catch (error) {
        errorMessage.textContent = error.message
        errorMessage.style.display = "block"
      } finally {
        loginButton.disabled = false
        buttonText.style.display = "block"
        loadingSpinner.style.display = "none"
      }
    })

    // Inicializar ícones Lucide
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons()
    }
  },
}

// Página do Dashboard
const dashboardPage = {
  init: () => {
    const session = sessionManager.getSession()

    if (!session) {
      window.location.href = "index.html"
      return
    }

    dashboardPage.createDashboardHTML()
    dashboardPage.loadUserData()
    dashboardPage.setupEventListeners()

    // Inicializar ícones Lucide
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons()
    }
  },

  createDashboardHTML: () => {
    document.body.innerHTML = `
    <div class="dashboard-container">
      <header class="dashboard-header">
        <div class="header-content">
          <div class="header-left">
            <div class="header-icon">
              <i data-lucide="credit-card"></i>
            </div>
            <h1 class="header-title">Sistema de Faturas</h1>
          </div>
          <div class="header-right">
            <div class="user-info">
              <i data-lucide="user"></i>
              <span id="userName"></span>
            </div>
            <button class="logout-button" id="logoutButton">
              <i data-lucide="log-out"></i>
              Sair
            </button>
          </div>
        </div>
      </header>
      
      <main class="dashboard-main">
        <!-- Seção de Boas-vindas -->
        <div class="welcome-section">
          <div class="welcome-card">
            <div class="welcome-content">
              <h2 id="welcomeMessage" class="welcome-title"></h2>
              <p class="welcome-subtitle">Gerencie suas faturas e pagamentos</p>
            </div>
            <div class="welcome-icon">
              <i data-lucide="user-check"></i>
            </div>
          </div>
        </div>

        <!-- Alerta de Fatura Atrasada -->
        <div id="overdueAlert" class="overdue-alert" style="display: none;">
          <div class="alert-content">
            <div class="alert-icon">
              <i data-lucide="alert-triangle"></i>
            </div>
            <div class="alert-text">
              <h3>Fatura Atrasada</h3>
              <p>Regularize para voltar a usar o sistema</p>
            </div>
          </div>
          <button id="payNowButton" class="pay-now-button">
            <i data-lucide="credit-card"></i>
            Pagar Agora
          </button>
        </div>
      
        <div id="loadingContainer" class="loading-container">
          <div class="loading-spinner-large"></div>
          <p class="loading-text">Carregando...</p>
        </div>
        
        <div id="dashboardContent" class="dashboard-content-mobile" style="display: none;">
          <!-- 1. Informações da Fatura (Topo) -->
          <div class="mobile-card invoice-card">
            <div class="mobile-card-header">
              <div class="mobile-card-icon">
                <i data-lucide="calendar"></i>
              </div>
              <div class="mobile-card-title">
                <h2>Informações da Fatura</h2>
                <p>Detalhes do seu vencimento e pagamento</p>
              </div>
            </div>
            <div class="mobile-card-content">
              <div class="invoice-info-grid">
                <div class="invoice-info-item">
                  <div class="info-label">Data de Vencimento</div>
                  <div class="info-value">
                    <i data-lucide="clock"></i>
                    <span id="dueDate"></span>
                    <span id="overdueBadge" class="badge badge-overdue" style="display: none;">
                      Vencido
                    </span>
                  </div>
                </div>
                
                <div class="invoice-info-item">
                  <div class="info-label">Valor da Fatura</div>
                  <div class="info-value amount-value">
                    <i data-lucide="dollar-sign"></i>
                    <span id="amount"></span>
                  </div>
                </div>
                
                <div class="invoice-info-item">
                  <div class="info-label">Status do Pagamento</div>
                  <div id="statusBadge" class="badge status-badge"></div>
                </div>
              </div>
              
              <button id="paymentButton" class="mobile-payment-button" style="display: none;">
                <i data-lucide="external-link"></i>
                <span class="button-text">Realizar Pagamento</span>
              </button>
              
              <div id="lastPayment" class="last-payment-mobile" style="display: none;">
                <div class="last-payment-label">Último Pagamento</div>
                <div id="lastPaymentDate" class="last-payment-date"></div>
              </div>
            </div>
          </div>
          
          <!-- 2. Ver Meus Acessos da TV -->
          <div class="mobile-card tv-access-card">
            <div class="mobile-card-header">
              <div class="mobile-card-icon tv-icon">
                <i data-lucide="tv"></i>
              </div>
              <div class="mobile-card-title">
                <h2>Ver Meus Acessos da TV</h2>
                <p>Informações sobre seu acesso aos canais</p>
              </div>
            </div>
            <div class="mobile-card-content">
              <div class="tv-features">
                <div class="tv-feature-item">
                  <div class="feature-icon">
                    <i data-lucide="check-circle"></i>
                  </div>
                  <div class="feature-text">
                    <strong>Acesso Total</strong>
                    <span>Liberado a todos os canais</span>
                  </div>
                </div>
                
                <div class="tv-feature-item">
                  <div class="feature-icon">
                    <i data-lucide="hd"></i>
                  </div>
                  <div class="feature-text">
                    <strong>Qualidade HD</strong>
                    <span>Disponível em alta definição</span>
                  </div>
                </div>
                
                <div class="tv-feature-item">
                  <div class="feature-icon">
                    <i data-lucide="headphones"></i>
                  </div>
                  <div class="feature-text">
                    <strong>Suporte 24/7</strong>
                    <span>Atendimento técnico sempre disponível</span>
                  </div>
                </div>
                
                <div class="tv-feature-item">
                  <div class="feature-icon">
                    <i data-lucide="refresh-cw"></i>
                  </div>
                  <div class="feature-text">
                    <strong>Atualizações</strong>
                    <span>Canais atualizados automaticamente</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 3. Informações Importantes -->
          <div id="importantInfoCard" class="mobile-card important-info-card" style="display: none;">
            <div class="mobile-card-header">
              <div class="mobile-card-icon important-icon">
                <i data-lucide="message-circle"></i>
              </div>
              <div class="mobile-card-title">
                <h2>Informações Importantes</h2>
                <p>Avisos e observações do administrador</p>
              </div>
            </div>
            <div class="mobile-card-content">
              <div id="importantInfoContent" class="important-info-content"></div>
            </div>
          </div>
        </div>
      </main>
    </div>
  `
  },

  loadUserData: async () => {
    const session = sessionManager.getSession()

    if (!supabase) {
      document.getElementById("loadingContainer").innerHTML = `
      <div class="error-container">
        <div class="error-icon">⚠️</div>
        <h3>Erro de Conexão</h3>
        <p>Não foi possível conectar com o banco de dados.</p>
        <p>Verifique se o Supabase está configurado corretamente.</p>
      </div>
    `
      return
    }

    const userData = await paymentSystem.getUserData(session.userId)

    if (!userData) {
      sessionManager.logout()
      return
    }

    // Simular carregamento
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Atualizar interface
    document.getElementById("userName").textContent = userData.name

    // Atualizar mensagem de boas-vindas
    const firstName = userData.name.split(" ")[0]
    document.getElementById("welcomeMessage").textContent = `Olá ${firstName}, Bem Vindo(a)!`

    // Verificar se está atrasado e mostrar alerta
    const overdueAlert = document.getElementById("overdueAlert")
    const payNowButton = document.getElementById("payNowButton")

    if (userData.status === "overdue") {
      overdueAlert.style.display = "flex"

      // Configurar botão de pagamento do alerta
      payNowButton.addEventListener("click", async () => {
        await paymentSystem.redirectToPayment(userData.id, userData.amount)
      })
    } else {
      overdueAlert.style.display = "none"
    }

    document.getElementById("dueDate").textContent = utils.formatDate(userData.dueDate)
    document.getElementById("amount").textContent = utils.formatCurrency(userData.amount)

    // Status
    const statusBadge = document.getElementById("statusBadge")
    const paymentButton = document.getElementById("paymentButton")
    const overdueBadge = document.getElementById("overdueBadge")

    let statusText = ""
    let statusClass = ""
    let statusIcon = ""

    switch (userData.status) {
      case "paid":
        statusText = "Pago"
        statusClass = "badge-paid"
        statusIcon = "check-circle"
        break
      case "overdue":
        statusText = "Vencido"
        statusClass = "badge-overdue"
        statusIcon = "alert-circle"
        overdueBadge.style.display = "inline-flex"
        paymentButton.style.display = "flex"
        break
      default:
        statusText = "Pendente"
        statusClass = "badge-pending"
        statusIcon = "clock"
        paymentButton.style.display = "flex"
    }

    statusBadge.className = `badge ${statusClass} status-badge`
    statusBadge.innerHTML = `<i data-lucide="${statusIcon}"></i>${statusText}`

    // Último pagamento
    if (userData.lastPayment) {
      document.getElementById("lastPayment").style.display = "block"
      document.getElementById("lastPaymentDate").textContent = utils.formatDateTime(userData.lastPayment)
    }

    // Mostrar informações importantes se existirem
    const importantInfoCard = document.getElementById("importantInfoCard")
    const importantInfoContent = document.getElementById("importantInfoContent")

    if (userData.observations && userData.observations.trim()) {
      importantInfoContent.textContent = userData.observations
      importantInfoCard.style.display = "block"
    } else {
      importantInfoCard.style.display = "none"
    }

    // Mostrar conteúdo
    document.getElementById("loadingContainer").style.display = "none"
    document.getElementById("dashboardContent").style.display = "block"

    // Recriar ícones
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons()
    }

    // Armazenar dados para uso no botão de pagamento
    window.currentUserData = userData
  },

  setupEventListeners: () => {
    // Logout
    document.getElementById("logoutButton").addEventListener("click", () => {
      sessionManager.logout()
    })

    // Pagamento - redirecionar para link externo
    const paymentButton = document.getElementById("paymentButton")
    if (paymentButton) {
      paymentButton.addEventListener("click", async () => {
        if (window.currentUserData) {
          await paymentSystem.redirectToPayment(window.currentUserData.id, window.currentUserData.amount)
        }
      })
    }
  },
}

// Inicialização baseada na página atual
document.addEventListener("DOMContentLoaded", () => {
  const currentPage = window.location.pathname.split("/").pop() || "index.html"

  if (currentPage === "dashboard.html") {
    dashboardPage.init()
  } else if (currentPage === "index.html" || currentPage === "") {
    loginPage.init()
  }
})
