// Configuração do Supabase usando variáveis de ambiente
const supabaseUrl = "https://nvrqxhwkcvycxhndhbft.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52cnF4aHdrY3Z5Y3hobmRoYmZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0ODQ2MzYsImV4cCI6MjA2OTA2MDYzNn0.WJB5zOX6lFuwLAdp7Dw5RW5wPaNBwP5cuxJKaAVMyLE"

// Inicializar cliente Supabase
let supabase = null

// Verificar se o Supabase está disponível
if (typeof window !== "undefined" && window.supabase) {
  try {
    supabase = window.supabase.createClient(supabaseUrl, supabaseKey)
    console.log("✅ Supabase conectado com sucesso no admin")
  } catch (error) {
    console.error("❌ Erro ao conectar com Supabase no admin:", error)
  }
} else {
  console.warn("⚠️ Supabase não está disponível no admin")
}

// Utilitários (reutilizados do script principal)
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
}

// Sistema administrativo
const adminSystem = {
  loadInvoices: async (statusFilter = "") => {
    if (!supabase) {
      console.error("Supabase não está disponível")
      return []
    }

    try {
      let query = supabase
        .from("invoices")
        .select(`
          *,
          users (
            name,
            username
          )
        `)
        .order("created_at", { ascending: false })

      if (statusFilter) {
        query = query.eq("status", statusFilter)
      }

      const { data: invoices, error } = await query

      if (error) {
        console.error("Erro ao carregar faturas:", error)
        return []
      }

      return invoices || []
    } catch (error) {
      console.error("Erro ao carregar faturas:", error)
      return []
    }
  },

  updateInvoiceStatus: async (invoiceId, status, adminName = "Admin") => {
    if (!supabase) {
      console.error("Supabase não está disponível")
      return false
    }

    try {
      const updateData = {
        status: status,
        updated_at: new Date().toISOString(),
      }

      if (status === "paid") {
        updateData.paid_at = new Date().toISOString()
        updateData.paid_by = adminName
      } else {
        updateData.paid_at = null
        updateData.paid_by = null
      }

      const { error } = await supabase.from("invoices").update(updateData).eq("id", invoiceId)

      if (error) {
        console.error("Erro ao atualizar status da fatura:", error)
        return false
      }

      return true
    } catch (error) {
      console.error("Erro ao atualizar status da fatura:", error)
      return false
    }
  },

  getSystemConfig: async (key) => {
    if (!supabase) {
      console.error("Supabase não está disponível")
      return ""
    }

    try {
      const { data, error } = await supabase.from("system_config").select("value").eq("key", key).single()

      if (error) {
        console.error("Erro ao buscar configuração:", error)
        return ""
      }

      return data.value
    } catch (error) {
      console.error("Erro ao buscar configuração:", error)
      return ""
    }
  },

  updateSystemConfig: async (key, value) => {
    if (!supabase) {
      console.error("Supabase não está disponível")
      return false
    }

    try {
      const { error } = await supabase.from("system_config").upsert({
        key: key,
        value: value,
        updated_at: new Date().toISOString(),
      })

      if (error) {
        console.error("Erro ao atualizar configuração:", error)
        return false
      }

      return true
    } catch (error) {
      console.error("Erro ao atualizar configuração:", error)
      return false
    }
  },

  getStatistics: async () => {
    if (!supabase) {
      console.error("Supabase não está disponível")
      return { pending: 0, paid: 0, overdue: 0, total: 0 }
    }

    try {
      const { data: invoices, error } = await supabase.from("invoices").select("status, amount")

      if (error) {
        console.error("Erro ao buscar estatísticas:", error)
        return { pending: 0, paid: 0, overdue: 0, total: 0 }
      }

      const stats = {
        pending: 0,
        paid: 0,
        overdue: 0,
        total: 0,
      }

      invoices.forEach((invoice) => {
        stats[invoice.status]++
        stats.total += Number.parseFloat(invoice.amount)
      })

      return stats
    } catch (error) {
      console.error("Erro ao buscar estatísticas:", error)
      return { pending: 0, paid: 0, overdue: 0, total: 0 }
    }
  },
}

// Sistema de reset mensal para admin
const monthlyResetAdmin = {
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

  getLastResetDate: async () => {
    if (!supabase) return null

    try {
      const { data, error } = await supabase.from("system_config").select("value").eq("key", "last_reset_date").single()

      if (error) {
        console.error("Erro ao buscar data do último reset:", error)
        return null
      }

      return data.value
    } catch (error) {
      console.error("Erro ao buscar data do último reset:", error)
      return null
    }
  },
}

// Adicionar novas funções para gerenciamento de usuários

// Sistema de usuários
const userSystem = {
  loadUsers: async () => {
    if (!supabase) {
      console.error("Supabase não está disponível")
      return []
    }

    try {
      const { data: users, error } = await supabase
        .from("users")
        .select(`
          *,
          invoices (
            id,
            due_date,
            amount,
            status,
            observations,
            paid_at,
            paid_by
          )
        `)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Erro ao carregar usuários:", error)
        return []
      }

      return users || []
    } catch (error) {
      console.error("Erro ao carregar usuários:", error)
      return []
    }
  },

  createUser: async (userData) => {
    if (!supabase) {
      console.error("Supabase não está disponível")
      return false
    }

    try {
      // Criar usuário
      const { data: user, error: userError } = await supabase
        .from("users")
        .insert({
          name: userData.name,
          username: userData.username,
          password: userData.password,
          amount: userData.amount,
          observations: userData.observations || null,
        })
        .select()
        .single()

      if (userError) {
        console.error("Erro ao criar usuário:", userError)
        return false
      }

      // Criar fatura inicial
      const { error: invoiceError } = await supabase.from("invoices").insert({
        user_id: user.id,
        due_date: userData.dueDate,
        amount: userData.amount,
        status: userData.status || "pending",
        observations: userData.invoiceObservations || null,
      })

      if (invoiceError) {
        console.error("Erro ao criar fatura:", invoiceError)
        return false
      }

      return true
    } catch (error) {
      console.error("Erro ao criar usuário:", error)
      return false
    }
  },

  updateUser: async (userId, userData) => {
    if (!supabase) {
      console.error("Supabase não está disponível")
      return false
    }

    try {
      // Atualizar usuário
      const { error: userError } = await supabase
        .from("users")
        .update({
          name: userData.name,
          username: userData.username,
          password: userData.password,
          amount: userData.amount,
          observations: userData.observations || null,
        })
        .eq("id", userId)

      if (userError) {
        console.error("Erro ao atualizar usuário:", userError)
        return false
      }

      // Atualizar fatura mais recente
      const { error: invoiceError } = await supabase
        .from("invoices")
        .update({
          due_date: userData.dueDate,
          amount: userData.amount,
          status: userData.status,
          observations: userData.invoiceObservations || null,
        })
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)

      if (invoiceError) {
        console.error("Erro ao atualizar fatura:", invoiceError)
        return false
      }

      return true
    } catch (error) {
      console.error("Erro ao atualizar usuário:", error)
      return false
    }
  },

  deleteUser: async (userId) => {
    if (!supabase) {
      console.error("Supabase não está disponível")
      return false
    }

    try {
      const { error } = await supabase.from("users").delete().eq("id", userId)

      if (error) {
        console.error("Erro ao deletar usuário:", error)
        return false
      }

      return true
    } catch (error) {
      console.error("Erro ao deletar usuário:", error)
      return false
    }
  },
}

// Página administrativa
const adminPage = {
  init: async () => {
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

    try {
      await adminPage.loadConfig()
      await adminPage.loadUsers()
      await adminPage.loadInvoices()
      await adminPage.loadStatistics()
      await adminPage.loadResetInfo()
      adminPage.setupEventListeners()

      document.getElementById("loadingContainer").style.display = "none"
      document.getElementById("adminContent").style.display = "block"

      // Inicializar ícones Lucide
      if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons()
      }
    } catch (error) {
      console.error("Erro ao inicializar admin:", error)
      document.getElementById("loadingContainer").innerHTML = `
        <div class="error-container">
          <div class="error-icon">❌</div>
          <h3>Erro ao Carregar</h3>
          <p>Ocorreu um erro ao carregar os dados administrativos.</p>
          <button onclick="window.location.reload()" class="retry-button">Tentar Novamente</button>
        </div>
      `
    }
  },

  loadConfig: async () => {
    const paymentLink = await adminSystem.getSystemConfig("payment_link")
    const paymentLinkInput = document.getElementById("paymentLink")
    if (paymentLinkInput) {
      paymentLinkInput.value = paymentLink
    }
  },

  loadInvoices: async (statusFilter = "") => {
    const invoices = await adminSystem.loadInvoices(statusFilter)
    const tableContainer = document.getElementById("invoicesTable")

    if (!tableContainer) return

    if (invoices.length === 0) {
      tableContainer.innerHTML = '<p class="no-data">Nenhuma fatura encontrada.</p>'
      return
    }

    const tableHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Vencimento</th>
            <th>Valor</th>
            <th>Status</th>
            <th>Pago em</th>
            <th>Pago por</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${invoices
            .map(
              (invoice) => `
            <tr>
              <td>
                <div class="user-cell">
                  <strong>${invoice.users?.name || "N/A"}</strong>
                  <small>${invoice.users?.username || "N/A"}</small>
                </div>
              </td>
              <td>${utils.formatDate(invoice.due_date)}</td>
              <td>${utils.formatCurrency(invoice.amount)}</td>
              <td>
                <span class="badge badge-${invoice.status}">
                  ${adminPage.getStatusText(invoice.status)}
                </span>
              </td>
              <td>${invoice.paid_at ? utils.formatDateTime(invoice.paid_at) : "-"}</td>
              <td>${invoice.paid_by || "-"}</td>
              <td>
                <div class="action-buttons">
                  ${
                    invoice.status !== "paid"
                      ? `
                    <button class="action-btn paid" onclick="adminPage.markAsPaid('${invoice.id}')">
                      <i data-lucide="check"></i>
                      Marcar como Pago
                    </button>
                  `
                      : ""
                  }
                  ${
                    invoice.status === "paid"
                      ? `
                    <button class="action-btn pending" onclick="adminPage.markAsPending('${invoice.id}')">
                      <i data-lucide="clock"></i>
                      Marcar como Pendente
                    </button>
                  `
                      : ""
                  }
                </div>
              </td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `

    tableContainer.innerHTML = tableHTML

    // Recriar ícones após inserir HTML
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons()
    }
  },

  loadStatistics: async () => {
    const stats = await adminSystem.getStatistics()

    const pendingCount = document.getElementById("pendingCount")
    const paidCount = document.getElementById("paidCount")
    const overdueCount = document.getElementById("overdueCount")
    const totalAmount = document.getElementById("totalAmount")

    if (pendingCount) pendingCount.textContent = stats.pending
    if (paidCount) paidCount.textContent = stats.paid
    if (overdueCount) overdueCount.textContent = stats.overdue
    if (totalAmount) totalAmount.textContent = utils.formatCurrency(stats.total)
  },

  getStatusText: (status) => {
    switch (status) {
      case "paid":
        return "Pago"
      case "overdue":
        return "Vencido"
      default:
        return "Pendente"
    }
  },

  markAsPaid: async (invoiceId) => {
    const success = await adminSystem.updateInvoiceStatus(invoiceId, "paid")

    if (success) {
      adminPage.showMessage("Fatura marcada como paga com sucesso!", "success")
      await adminPage.refreshData()
    } else {
      adminPage.showMessage("Erro ao marcar fatura como paga.", "error")
    }
  },

  markAsPending: async (invoiceId) => {
    const success = await adminSystem.updateInvoiceStatus(invoiceId, "pending")

    if (success) {
      adminPage.showMessage("Fatura marcada como pendente com sucesso!", "success")
      await adminPage.refreshData()
    } else {
      adminPage.showMessage("Erro ao marcar fatura como pendente.", "error")
    }
  },

  refreshData: async () => {
    const statusFilter = document.getElementById("statusFilter")?.value || ""
    await adminPage.loadInvoices(statusFilter)
    await adminPage.loadStatistics()
  },

  showMessage: (message, type) => {
    const messageContainer = document.getElementById("messageContainer")
    const messageContent = document.getElementById("messageContent")

    if (!messageContainer || !messageContent) return

    messageContent.className = type === "success" ? "success-message" : "error-alert"
    messageContent.textContent = message
    messageContainer.style.display = "block"

    setTimeout(() => {
      messageContainer.style.display = "none"
    }, 3000)
  },

  setupEventListeners: () => {
    // Salvar configuração
    const configForm = document.getElementById("configForm")
    if (configForm) {
      configForm.addEventListener("submit", async (e) => {
        e.preventDefault()

        const paymentLink = document.getElementById("paymentLink")?.value
        if (!paymentLink) return

        const success = await adminSystem.updateSystemConfig("payment_link", paymentLink)

        if (success) {
          adminPage.showMessage("Configuração salva com sucesso!", "success")
        } else {
          adminPage.showMessage("Erro ao salvar configuração.", "error")
        }
      })
    }

    // Filtro de status
    const statusFilter = document.getElementById("statusFilter")
    if (statusFilter) {
      statusFilter.addEventListener("change", async (e) => {
        await adminPage.loadInvoices(e.target.value)
      })
    }

    // Botão de atualizar
    const refreshButton = document.getElementById("refreshButton")
    if (refreshButton) {
      refreshButton.addEventListener("click", async () => {
        await adminPage.refreshData()
      })
    }

    // Adicionar funções de gerenciamento de usuários ao adminPage
  },
  loadUsers: async () => {
    const users = await userSystem.loadUsers()
    const tableContainer = document.getElementById("usersTable")

    if (!tableContainer) return

    if (users.length === 0) {
      tableContainer.innerHTML = '<p class="no-data">Nenhum usuário encontrado.</p>'
      return
    }

    const tableHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Login</th>
            <th>Valor</th>
            <th>Vencimento</th>
            <th>Status</th>
            <th>Observações</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${users
            .map((user) => {
              const invoice = user.invoices && user.invoices.length > 0 ? user.invoices[0] : null
              return `
            <tr>
              <td>
                <div class="user-cell">
                  <strong>${user.name}</strong>
                  <small>Criado em ${utils.formatDate(user.created_at)}</small>
                </div>
              </td>
              <td>${user.username}</td>
              <td>${utils.formatCurrency(user.amount)}</td>
              <td>${invoice ? utils.formatDate(invoice.due_date) : "-"}</td>
              <td>
                ${invoice ? `<span class="badge badge-${invoice.status}">${adminPage.getStatusText(invoice.status)}</span>` : "-"}
              </td>
              <td>
                <div class="observations-cell">
                  ${user.observations ? `<div class="user-obs">${user.observations}</div>` : ""}
                  ${invoice && invoice.observations ? `<div class="invoice-obs">${invoice.observations}</div>` : ""}
                </div>
              </td>
              <td>
                <div class="action-buttons">
                  <button class="action-btn edit" onclick="adminPage.editUser('${user.id}')">
                    <i data-lucide="edit"></i>
                    Editar
                  </button>
                  <button class="action-btn delete" onclick="adminPage.deleteUser('${user.id}', '${user.name}')">
                    <i data-lucide="trash-2"></i>
                    Excluir
                  </button>
                </div>
              </td>
            </tr>
          `
            })
            .join("")}
        </tbody>
      </table>
    `

    tableContainer.innerHTML = tableHTML

    // Recriar ícones após inserir HTML
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons()
    }
  },

  openUserModal: (user = null) => {
    const modal = document.getElementById("userModal")
    const modalTitle = document.getElementById("modalTitle")
    const form = document.getElementById("userForm")

    if (user) {
      // Modo edição
      modalTitle.textContent = "Editar Usuário"
      document.getElementById("userId").value = user.id
      document.getElementById("userName").value = user.name
      document.getElementById("userUsername").value = user.username
      document.getElementById("userPassword").value = user.password
      document.getElementById("userAmount").value = user.amount
      document.getElementById("userObservations").value = user.observations || ""

      if (user.invoices && user.invoices.length > 0) {
        const invoice = user.invoices[0]
        document.getElementById("userDueDate").value = invoice.due_date
        document.getElementById("invoiceStatus").value = invoice.status
        document.getElementById("invoiceObservations").value = invoice.observations || ""
      }
    } else {
      // Modo criação
      modalTitle.textContent = "Adicionar Usuário"
      form.reset()

      // Definir data padrão como dia 10 do próximo mês
      const nextMonth = new Date()
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      nextMonth.setDate(10)
      document.getElementById("userDueDate").value = nextMonth.toISOString().split("T")[0]
    }

    modal.style.display = "flex"
  },

  closeUserModal: () => {
    const modal = document.getElementById("userModal")
    modal.style.display = "none"
  },

  saveUser: async (formData) => {
    const userId = formData.get("userId")
    const userData = {
      name: formData.get("userName"),
      username: formData.get("userUsername"),
      password: formData.get("userPassword"),
      amount: Number.parseFloat(formData.get("userAmount")),
      observations: formData.get("userObservations"),
      dueDate: formData.get("userDueDate"),
      status: formData.get("invoiceStatus"),
      invoiceObservations: formData.get("invoiceObservations"),
    }

    let success = false

    if (userId) {
      // Atualizar usuário existente
      success = await userSystem.updateUser(userId, userData)
    } else {
      // Criar novo usuário
      success = await userSystem.createUser(userData)
    }

    if (success) {
      adminPage.showMessage(userId ? "Usuário atualizado com sucesso!" : "Usuário criado com sucesso!", "success")
      adminPage.closeUserModal()
      await adminPage.loadUsers()
      await adminPage.loadInvoices()
      await adminPage.loadStatistics()
    } else {
      adminPage.showMessage("Erro ao salvar usuário.", "error")
    }
  },

  editUser: async (userId) => {
    const users = await userSystem.loadUsers()
    const user = users.find((u) => u.id === userId)

    if (user) {
      adminPage.openUserModal(user)
    }
  },

  deleteUser: async (userId, userName) => {
    if (confirm(`Tem certeza que deseja excluir o usuário "${userName}"? Esta ação não pode ser desfeita.`)) {
      const success = await userSystem.deleteUser(userId)

      if (success) {
        adminPage.showMessage("Usuário excluído com sucesso!", "success")
        await adminPage.loadUsers()
        await adminPage.loadInvoices()
        await adminPage.loadStatistics()
      } else {
        adminPage.showMessage("Erro ao excluir usuário.", "error")
      }
    }
  },
  executeMonthlyReset: async () => {
    if (
      confirm(
        "Tem certeza que deseja resetar todas as faturas para status PENDENTE? Esta ação irá:\n\n• Definir todas as faturas como PENDENTE\n• Atualizar vencimento para dia 10 do mês atual\n• Remover dados de pagamento\n\nEsta ação não pode ser desfeita.",
      )
    ) {
      const success = await monthlyResetAdmin.executeManualReset()

      if (success) {
        adminPage.showMessage(
          "Reset mensal executado com sucesso! Todas as faturas foram definidas como pendentes.",
          "success",
        )
        await adminPage.refreshData()
      } else {
        adminPage.showMessage("Erro ao executar reset mensal.", "error")
      }
    }
  },

  loadResetInfo: async () => {
    const lastResetDate = await monthlyResetAdmin.getLastResetDate()
    const resetInfoElement = document.getElementById("lastResetInfo")

    if (resetInfoElement && lastResetDate && lastResetDate !== "1900-01-01") {
      const date = new Date(lastResetDate)
      resetInfoElement.textContent = `Último reset: ${utils.formatDate(lastResetDate)}`
      resetInfoElement.style.display = "block"
    }
  },
}

// Atualizar a função init para carregar usuários
const originalInit = adminPage.init
adminPage.init = async () => {
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

  try {
    await adminPage.loadConfig()
    await adminPage.loadUsers()
    await adminPage.loadInvoices()
    await adminPage.loadStatistics()
    await adminPage.loadResetInfo()
    adminPage.setupEventListeners()

    document.getElementById("loadingContainer").style.display = "none"
    document.getElementById("adminContent").style.display = "block"

    // Inicializar ícones Lucide
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons()
    }
  } catch (error) {
    console.error("Erro ao inicializar admin:", error)
    document.getElementById("loadingContainer").innerHTML = `
      <div class="error-container">
        <div class="error-icon">❌</div>
        <h3>Erro ao Carregar</h3>
        <p>Ocorreu um erro ao carregar os dados administrativos.</p>
        <button onclick="window.location.reload()" class="retry-button">Tentar Novamente</button>
      </div>
    `
  }
}

// Atualizar setupEventListeners para incluir eventos do modal
const originalSetupEventListeners = adminPage.setupEventListeners
adminPage.setupEventListeners = () => {
  // Eventos originais
  // Eventos originais existentes...

  // Eventos do modal de usuário
  const addUserButton = document.getElementById("addUserButton")
  if (addUserButton) {
    addUserButton.addEventListener("click", () => {
      adminPage.openUserModal()
    })
  }

  const closeModal = document.getElementById("closeModal")
  if (closeModal) {
    closeModal.addEventListener("click", () => {
      adminPage.closeUserModal()
    })
  }

  const cancelButton = document.getElementById("cancelButton")
  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      adminPage.closeUserModal()
    })
  }

  const userForm = document.getElementById("userForm")
  if (userForm) {
    userForm.addEventListener("submit", async (e) => {
      e.preventDefault()
      const formData = new FormData(userForm)
      await adminPage.saveUser(formData)
    })
  }

  // Fechar modal ao clicar fora
  const modal = document.getElementById("userModal")
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        adminPage.closeUserModal()
      }
    })
  }

  // Botão de reset mensal
  // Botão de reset manual
  const manualResetButton = document.getElementById("monthlyResetButton")
  if (manualResetButton) {
    manualResetButton.addEventListener("click", () => {
      adminPage.executeMonthlyReset()
    })
  }
}

// Inicialização da página administrativa
document.addEventListener("DOMContentLoaded", () => {
  adminPage.init()
})

// Expor funções globalmente para uso nos botões
window.adminPage = adminPage
