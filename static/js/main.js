// TRẠNG THÁI ỨNG DỤNG (STATE)
let appState = {
    isAdmin: false,
    passcode: '',
    activeTab: 'processing',
    charts: {
        status: null,
        monthly: null
    }
};

// ĐỢI TÀI LIỆU TẢI XONG
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initFlatpickr(selector) {
    if (typeof flatpickr !== 'undefined') {
        flatpickr(selector, {
            locale: "vn",
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d/m/Y",
            allowInput: true
        });
    }
}

function setFlatpickrDate(id, dateString) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el._flatpickr) {
        el._flatpickr.setDate(dateString);
    } else {
        el.value = dateString;
    }
}

// KHỞI TẠO ỨNG DỤNG
async function initApp() {
    setupEventListeners();
    setupValueInputPreview();
    
    // Khởi tạo Flatpickr cho các input tĩnh
    initFlatpickr('#input-start-date');
    initFlatpickr('#input-end-date');
    
    // Tự động kiểm tra trạng thái Admin từ localStorage
    const cachedPasscode = localStorage.getItem('admin_passcode');
    if (cachedPasscode) {
        const isValid = await verifyAdminPasscode(cachedPasscode);
        if (isValid) {
            setAdminState(true, cachedPasscode);
        } else {
            setAdminState(false);
        }
    } else {
        setAdminState(false);
    }

    // Tải dữ liệu ban đầu
    switchTab('processing');
}

// THIẾT LẬP CÁC LẮNG NGHE SỰ KIỆN (EVENT LISTENERS)
function setupEventListeners() {
    // Chuyển Tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = e.currentTarget.getAttribute('data-tab');
            switchTab(tabName);
        });
    });

    // Mở/Khóa Admin
    document.getElementById('auth-btn').addEventListener('click', () => {
        if (appState.isAdmin) {
            // Thực hiện khóa Admin
            setAdminState(false);
            showNotification('Đã thoát chế độ Admin', 'info');
            refreshCurrentTab();
        } else {
            openModal('auth-modal');
            document.getElementById('admin-passcode').focus();
        }
    });

    // Nút mở Modal thêm hợp đồng
    document.getElementById('open-add-modal-btn').addEventListener('click', () => {
        if (!appState.isAdmin) return;
        
        // Reset form
        document.getElementById('add-contract-form').reset();
        document.getElementById('value-preview').innerText = '0 VND';
        document.getElementById('add-error-msg').innerText = '';
        
        // Đặt ngày mặc định (Ngày bắt đầu là hôm nay, ngày kết thúc là 1 tháng sau)
        const today = new Date().toISOString().split('T')[0];
        const nextMonthDate = new Date();
        nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
        const nextMonth = nextMonthDate.toISOString().split('T')[0];
        
        document.getElementById('input-start-date').value = today;
        document.getElementById('input-end-date').value = nextMonth;
        
        openModal('add-contract-modal');
    });

    // Nhấn Enter để gửi trong khung chat soạn thảo AI
    const chatInput = document.getElementById('ai-chat-input');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAiChatSend();
            }
        });
        
        // Tự động tăng độ cao của textarea khi nhập chữ, tối đa 8 dòng
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });
    }
}

// THIẾT LẬP PREVIEW GIÁ TRỊ HỢP ĐỒNG KHI NHẬP SỐ
function setupValueInputPreview() {
    const valueInput = document.getElementById('input-value');
    const previewSpan = document.getElementById('value-preview');
    
    valueInput.addEventListener('input', (e) => {
        const valStr = e.target.value.replace(/\./g, '');
        const val = parseFloat(valStr);
        if (isNaN(val) || val < 0) {
            previewSpan.innerText = '0 VND';
        } else {
            previewSpan.innerText = formatCurrency(val);
        }
    });
}

function formatNumberInput(el) {
    let val = el.value.replace(/[^0-9]/g, '');
    if (!val) {
        el.value = '';
        return;
    }
    el.value = val.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// CHUYỂN ĐỔI TAB GIAO DIỆN
function switchTab(tabName) {
    appState.activeTab = tabName;
    
    // Cập nhật CSS của nút tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Cập nhật CSS hiển thị khu vực tab
    document.querySelectorAll('.tab-pane').forEach(pane => {
        if (pane.id === `tab-${tabName}`) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });
    
    // Load dữ liệu tương ứng
    refreshCurrentTab();
}

// LÀM MỚI TAB HIỆN TẠI
function refreshCurrentTab() {
    if (appState.activeTab === 'processing') {
        loadContractsList('processing', 'processing-list');
    } else if (appState.activeTab === 'completed') {
        loadContractsList('completed', 'completed-list');
    } else if (appState.activeTab === 'statistics') {
        loadStatistics();
    } else if (appState.activeTab === 'ai-writer') {
        loadTemplatesDropdown();
    }
}

// GỌI API LẤY DANH SÁCH HỢP ĐỒNG VÀ HIỂN THỊ
async function loadContractsList(status, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = `
        <div class="loading-spinner">
            <i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải dữ liệu...
        </div>
    `;

    try {
        const response = await fetch(`/api/contracts?status=${status}`);
        if (!response.ok) throw new Error('Không thể tải dữ liệu từ máy chủ.');
        const contracts = await response.json();
        
        renderContracts(contracts, container, status);
    } catch (error) {
        console.error(error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation" style="color: var(--color-danger)"></i>
                <h4>Lỗi tải dữ liệu</h4>
                <p>${error.message}</p>
                <button class="btn btn-secondary" onclick="refreshCurrentTab()"><i class="fa-solid fa-arrows-rotate"></i> Thử lại</button>
            </div>
        `;
    }
}

// HIỂN THỊ CÁC THẺ HỢP ĐỒNG LÊN GIAO DIỆN
function renderContracts(contracts, container, status) {
    if (contracts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-folder-open"></i>
                <h4>Chưa có hợp đồng nào</h4>
                <p>${status === 'processing' ? 'Hiện không có hợp đồng nào đang trong quá trình thực hiện.' : 'Chưa có hợp đồng nào được hoàn thành.'}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    const todayStr = new Date().toISOString().split('T')[0];

    contracts.forEach(contract => {
        const isOverdue = status === 'processing' && contract.end_date < todayStr;
        
        // Tạo phần tử thẻ hợp đồng
        const card = document.createElement('div');
        card.className = `contract-card ${isOverdue ? 'overdue-glow' : ''}`;
        
        // HTML của thẻ hợp đồng
        card.innerHTML = `
            <div class="card-header">
                <span class="code-badge"><i class="fa-solid fa-hashtag"></i> ${escapeHTML(contract.contract_code)}</span>
                <div class="header-actions">
                    ${status === 'processing' ? `
                        <button class="edit-btn admin-only" style="background:none; border:none; color:#38bdf8; cursor:pointer; font-size:16px; margin-right:5px; transition:0.2s;"
                                ${appState.isAdmin ? '' : 'disabled'} 
                                onclick="openEditContractModal(${contract.id}, event)"
                                title="${appState.isAdmin ? 'Sửa hợp đồng' : 'Yêu cầu quyền Admin'}"
                        >
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <div class="checkbox-complete-wrapper" title="${appState.isAdmin ? 'Tích để hoàn thành hợp đồng' : 'Yêu cầu quyền Admin'}">
                            <input type="checkbox" 
                                   class="complete-checkbox" 
                                   ${appState.isAdmin ? '' : 'disabled'} 
                                   onclick="handleMarkComplete(${contract.id}, event)"
                            >
                        </div>
                    ` : `
                        <button class="revert-btn admin-only" 
                                ${appState.isAdmin ? '' : 'disabled'} 
                                onclick="handleRevertContract(${contract.id}, event)"
                                title="${appState.isAdmin ? 'Hoàn tác về Đang xử lý' : 'Yêu cầu quyền Admin'}"
                        >
                            <i class="fa-solid fa-rotate-left"></i> Hoàn tác
                        </button>
                        <span class="status-badge completed"><i class="fa-solid fa-circle-check"></i> Xong</span>
                    `}
                    <button class="delete-btn admin-only" 
                            ${appState.isAdmin ? '' : 'disabled'} 
                            onclick="handleDeleteContract(${contract.id}, '${escapeQuote(contract.contract_code)}', event)"
                            title="${appState.isAdmin ? 'Xóa hợp đồng' : 'Yêu cầu quyền Admin'}"
                    >
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
            
            <div class="card-body">
                <h3 class="partner-name" title="${escapeHTML(contract.partner_name)}">${escapeHTML(contract.partner_name)}</h3>
                <div class="value-highlight">
                    <i class="fa-solid fa-coins"></i> ${formatCurrency(contract.value)}
                </div>
                
                <div class="date-timeline">
                    <div class="date-box">
                        <span class="date-label">Bắt đầu</span>
                        <span class="date-val">${formatDate(contract.start_date)}</span>
                    </div>
                    <div class="date-arrow"><i class="fa-solid fa-arrow-right"></i></div>
                    <div class="date-box">
                        <span class="date-label">Dự kiến xong</span>
                        <span class="date-val">${formatDate(contract.end_date)}</span>
                    </div>
                </div>
                
                ${status === 'processing' ? `
                    <div class="status-row">
                        <span>Hạn thực hiện:</span>
                        ${isOverdue ? `
                            <span class="status-badge overdue"><i class="fa-solid fa-triangle-exclamation"></i> Trễ hạn</span>
                        ` : `
                            <span class="status-badge processing"><i class="fa-solid fa-clock"></i> Đúng hạn</span>
                        `}
                    </div>
                ` : ''}
            </div>
            
            <div class="card-footer">
                <div class="notes-label">
                    <span><i class="fa-solid fa-message"></i> Ghi chú Tiến độ:</span>
                    ${status === 'processing' ? `
                        <button class="edit-notes-trigger" 
                                ${appState.isAdmin ? '' : 'disabled'} 
                                onclick="openEditNotesModal(${contract.id}, '${escapeQuote(contract.contract_code)}', '${escapeQuote(contract.partner_name)}', '${escapeQuote(contract.progress_notes)}')"
                                title="${appState.isAdmin ? 'Chỉnh sửa tiến độ' : 'Yêu cầu quyền Admin'}"
                        >
                            <i class="fa-solid fa-pen"></i> Sửa
                        </button>
                    ` : ''}
                </div>
                <div class="notes-content ${contract.progress_notes ? '' : 'empty'}">
                    ${contract.progress_notes ? escapeHTML(contract.progress_notes).replace(/\\n/g, '<br>') : 'Không có ghi chú tiến độ.'}
                </div>
            </div>
            
            ${contract.installments && contract.installments.length > 0 ? `
            <div class="installments-card-section" style="padding: 15px; border-top: 1px solid rgba(255,255,255,0.05);">
                <h4 style="margin:0 0 10px 0; font-size:14px; color:#94a3b8;"><i class="fa-solid fa-list-check"></i> Các Đợt Thanh Toán</h4>
                <div class="installments-list" style="display:flex; flex-direction:column; gap:8px;">
                    ${contract.installments.map(inst => `
                        <div class="installment-item" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:8px 12px; border-radius:6px;">
                            <div style="flex:1;">
                                <div style="font-weight:600; color:#fbbf24;">${formatCurrency(inst.amount)}</div>
                                <div style="font-size:12px; color:#64748b;">Hạn: ${formatDate(inst.deadline_date) || 'Không có'}</div>
                            </div>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <input type="date" class="inst-date-picker" 
                                       id="inst-date-${inst.id}" 
                                       value="${inst.paid_date || todayStr}" 
                                       placeholder="dd/mm/yyyy"
                                       ${!appState.isAdmin || (status !== 'processing') ? 'disabled' : ''}
                                       style="padding:4px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); background:rgba(15,23,42,0.5); color:#fff; font-size:12px;"
                                >
                                <input type="checkbox" class="inst-paid-checkbox" 
                                       ${inst.is_paid ? 'checked' : ''}
                                       ${!appState.isAdmin || (status !== 'processing') ? 'disabled' : ''}
                                       onchange="handleInstallmentPayment(${inst.id}, this)"
                                >
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            ${contract.tasks && contract.tasks.length > 0 ? `
            <div class="tasks-card-section" style="padding: 15px; border-top: 1px solid rgba(255,255,255,0.05);">
                <h4 style="margin:0 0 10px 0; font-size:14px; color:#94a3b8;"><i class="fa-solid fa-list-check"></i> Checklist Tiến Độ</h4>
                <div class="tasks-list" style="display:flex; flex-direction:column; gap:8px;">
                    ${contract.tasks.map(t => {
                        const isOverdue = status === 'processing' && !t.is_completed && t.target_date && t.target_date < todayStr;
                        const statusLabels = {
                            1: "Chờ ký kết",
                            2: "Hoàn thiện giấy tờ",
                            3: "Giục cọc/thanh toán",
                            4: "Nghiệm thu",
                            5: "Hóa đơn",
                            6: "Giục thanh toán tiền"
                        };
                        const statusClass = `task-badge status-${t.status_type}`;
                        const statusText = statusLabels[t.status_type] || "Khác";
                        return `
                            <div class="task-card-item ${t.is_completed ? 'completed' : ''}" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:8px 12px; border-radius:6px; transition:0.2s;">
                                <div style="display:flex; align-items:center; gap:10px; width:100%;">
                                    <input type="checkbox" class="task-complete-checkbox" 
                                           ${t.is_completed ? 'checked' : ''}
                                           ${!appState.isAdmin || (status !== 'processing') ? 'disabled' : ''}
                                           onchange="handleTaskCompletion(${t.id}, this)"
                                           style="cursor:pointer;"
                                    >
                                    <div style="flex:1; overflow:hidden;">
                                        <div class="task-text" style="font-weight:500; font-size:13px; color:${t.is_completed ? 'var(--text-muted)' : '#fff'}; text-decoration:${t.is_completed ? 'line-through' : 'none'}; text-align:left;">${escapeHTML(t.task_name)}</div>
                                        <div style="font-size:11px; display:flex; align-items:center; gap:8px; margin-top:2px;">
                                            <span class="${statusClass}">${statusText}</span>
                                            <span class="task-date ${isOverdue ? 'overdue-text' : ''}" style="color:${isOverdue ? 'var(--color-danger)' : 'var(--text-secondary)'}; font-weight:${isOverdue ? '600' : 'normal'};">Hạn: ${formatDate(t.target_date) || 'Không có'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            ` : ''}
        `;
        
        container.appendChild(card);
    });
    
    // Khởi tạo Flatpickr cho các input date trong danh sách hợp đồng
    initFlatpickr(container.querySelectorAll('.inst-date-picker'));
}

async function loadStatistics() {
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) throw new Error('Không thể tải thống kê.');
        const stats = await response.json();
        
        // 1. Hiển thị các khối chỉ số KPI
        document.getElementById('stat-total-count').innerText = stats.total.count;
        document.getElementById('stat-total-value').innerText = formatCurrency(stats.total.value);
        document.getElementById('stat-processing-count').innerText = stats.processing.count;
        document.getElementById('stat-completed-count').innerText = stats.completed.count;
        
        document.getElementById('stat-overdue-count').innerText = stats.overdue.count;
        document.getElementById('stat-overdue-value').innerText = formatCurrency(stats.overdue.total_value);
        
        document.getElementById('stat-actual-revenue').innerText = formatCurrency(stats.total.actual_revenue || 0);
        document.getElementById('stat-unreceived-revenue').innerText = formatCurrency(stats.total.unreceived_revenue || 0);
        
        // Cập nhật bảng hợp đồng đang thực hiện
        const executingTbody = document.getElementById('executing-table-body');
        if (executingTbody) {
            executingTbody.innerHTML = '';
            if (stats.executing_contracts && stats.executing_contracts.length > 0) {
                stats.executing_contracts.forEach(c => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${escapeHTML(c.contract_code)}</td>
                        <td>${escapeHTML(c.partner_name)}</td>
                        <td>${formatCurrency(c.value)}</td>
                        <td>${formatCurrency(c.remaining_value)}</td>
                        <td>${escapeHTML(c.progress_notes || '')}</td>
                    `;
                    executingTbody.appendChild(tr);
                });
            } else {
                executingTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#64748b;">Không có hợp đồng nào đang thực hiện</td></tr>';
            }
        }
        
        // 2. Vẽ biểu đồ tỉ lệ trạng thái
        renderStatusChart(stats.processing.count, stats.completed.count);
        
        // 3. Vẽ biểu đồ giá trị theo tháng
        renderMonthlyChart(stats.monthly);
        
        // 4. Vẽ biểu đồ doanh thu theo tháng thanh toán
        renderRevenueChart(stats.revenue_monthly);

    } catch (error) {
        console.error(error);
        showNotification('Lỗi tải dữ liệu thống kê: ' + error.message, 'error');
    }
}

// VẼ BIỂU ĐỒ TRÒN TỶ LỆ TRẠNG THÁI
function renderStatusChart(processingCount, completedCount) {
    const ctx = document.getElementById('statusDoughnutChart').getContext('2d');
    
    // Hủy biểu đồ cũ nếu đã tồn tại để tránh xunglọc bộ nhớ vẽ đè
    if (appState.charts.status) {
        appState.charts.status.destroy();
    }
    
    // Nếu chưa có dữ liệu thì không vẽ
    if (processingCount === 0 && completedCount === 0) {
        ctx.clearRect(0, 0, 100, 100);
        return;
    }
    
    appState.charts.status = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Đang xử lý', 'Đã hoàn thành'],
            datasets: [{
                data: [processingCount, completedCount],
                backgroundColor: ['#38bdf8', '#34d399'],
                borderColor: ['rgba(30, 41, 59, 0.8)', 'rgba(30, 41, 59, 0.8)'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#f8fafc',
                        font: { family: 'Outfit', size: 12 }
                    }
                }
            },
            cutout: '65%'
        }
    });
}

// VẼ BIỂU ĐỒ CỘT THÁNG BẮT ĐẦU
function renderMonthlyChart(monthlyData) {
    const ctx = document.getElementById('monthlyValueBarChart').getContext('2d');
    
    if (appState.charts.monthly) {
        appState.charts.monthly.destroy();
    }
    
    if (monthlyData.length === 0) {
        return;
    }
    
    const labels = monthlyData.map(item => {
        const parts = item.month.split('-');
        return `T${parts[1]}/${parts[0]}`; // Định dạng T05/2026
    });
    const values = monthlyData.map(item => item.total_value / 1000000); // Đổi đơn vị triệu đồng
    const counts = monthlyData.map(item => item.count);
    
    appState.charts.monthly = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Giá trị hợp đồng (Triệu VND)',
                    data: values,
                    backgroundColor: 'rgba(251, 191, 36, 0.75)',
                    borderColor: '#fbbf24',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    yAxisID: 'y'
                },
                {
                    label: 'Số lượng hợp đồng',
                    data: counts,
                    type: 'line',
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.2)',
                    borderWidth: 2,
                    pointBackgroundColor: '#38bdf8',
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                },
                y: {
                    position: 'left',
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } },
                    title: { display: true, text: 'Triệu VND', color: '#fbbf24' }
                },
                y1: {
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' }, stepSize: 1 },
                    title: { display: true, text: 'Số lượng HĐ', color: '#38bdf8' }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#f8fafc', font: { family: 'Outfit', size: 11 } }
                }
            }
        }
    });
}

// VẼ BIỂU ĐỒ DOANH THU THEO THÁNG
function renderRevenueChart(revenueData) {
    const ctx = document.getElementById('revenueMonthlyBarChart').getContext('2d');
    
    if (appState.charts.revenue) {
        appState.charts.revenue.destroy();
    }
    
    if (!revenueData || revenueData.length === 0) {
        return;
    }
    
    const labels = revenueData.map(item => {
        if(!item.month) return 'Không rõ';
        const parts = item.month.split('-');
        return `T${parts[1]}/${parts[0]}`;
    });
    const values = revenueData.map(item => item.revenue / 1000000); // Triệu VND
    
    appState.charts.revenue = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Doanh thu (Triệu VND)',
                    data: values,
                    backgroundColor: 'rgba(52, 211, 153, 0.75)',
                    borderColor: '#34d399',
                    borderWidth: 1.5,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } },
                    title: { display: true, text: 'Triệu VND', color: '#34d399' }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#f8fafc', font: { family: 'Outfit', size: 11 } }
                }
            }
        }
    });
}

// XỬ LÝ GỬI YÊU CẦU MỞ KHÓA ADMIN (AUTH)
async function handleAuthSubmit(event) {
    event.preventDefault();
    const passcode = document.getElementById('admin-passcode').value;
    const errorMsg = document.getElementById('auth-error-msg');
    errorMsg.innerText = '';
    
    const isValid = await verifyAdminPasscode(passcode);
    if (isValid) {
        setAdminState(true, passcode);
        localStorage.setItem('admin_passcode', passcode);
        closeModal('auth-modal');
        showNotification('Đã mở khóa thành công quyền Admin!', 'success');
        refreshCurrentTab();
    } else {
        errorMsg.innerText = 'Mã khóa không chính xác. Vui lòng thử lại!';
    }
}

// XÁC THỰC MÃ KHÓA QUA BACKEND API
async function verifyAdminPasscode(passcode) {
    try {
        const response = await fetch('/api/verify-passcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode })
        });
        const data = await response.json();
        return data.success === true;
    } catch (e) {
        console.error('Lỗi kiểm tra passcode:', e);
        return false;
    }
}

// CẬP NHẬT TRẠNG THÁI GIAO DIỆN KHI ĐỔI QUYỀN ADMIN
function setAdminState(isAdmin, passcode = '') {
    appState.isAdmin = isAdmin;
    appState.passcode = passcode;
    
    const authBtn = document.getElementById('auth-btn');
    const roleBadge = document.getElementById('role-badge');
    const adminOnlyElements = document.querySelectorAll('.admin-only');
    
    if (isAdmin) {
        authBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Khóa Admin';
        authBtn.className = 'btn btn-danger';
        roleBadge.innerHTML = '<i class="fa-solid fa-user-gear"></i> Admin (Sửa)';
        roleBadge.className = 'badge-role admin';
        
        // Kích hoạt các tính năng chỉ dành cho Admin
        adminOnlyElements.forEach(el => {
            el.removeAttribute('disabled');
        });
    } else {
        authBtn.innerHTML = '<i class="fa-solid fa-key"></i> Mở khóa Admin';
        authBtn.className = 'btn btn-secondary';
        roleBadge.innerHTML = '<i class="fa-solid fa-user-lock"></i> Chỉ xem';
        roleBadge.className = 'badge-role guest';
        
        // Vô hiệu hóa các tính năng
        adminOnlyElements.forEach(el => {
            el.setAttribute('disabled', 'true');
        });
        localStorage.removeItem('admin_passcode');
    }
}

// THÊM HỢP ĐỒNG MỚI LÊN HỆ THỐNG
async function handleAddContractSubmit(event) {
    event.preventDefault();
    const errorMsg = document.getElementById('add-error-msg');
    errorMsg.innerText = '';
    
    // Thu thập danh sách đợt thanh toán
    const installments = [];
    document.querySelectorAll('.installment-row').forEach(row => {
        const id = row.querySelector('.inst-id').value;
        const amountStr = row.querySelector('.inst-amount').value.replace(/\./g, '');
        const amount = amountStr ? parseFloat(amountStr) : 0;
        const date = row.querySelector('.inst-date').value;
        const isPaid = row.querySelector('.inst-is-paid').checked;
        const paidDate = row.querySelector('.inst-paid-date').value;
        if (amount) {
            installments.push({
                id: id || null,
                amount: amount,
                deadline_date: date,
                is_paid: isPaid ? 1 : 0,
                paid_date: isPaid ? paidDate : null
            });
        }
    });
    
    // Thu thập danh sách công việc checklist
    const tasks = [];
    document.querySelectorAll('.task-row').forEach(row => {
        const id = row.querySelector('.task-id').value;
        const name = row.querySelector('.task-name').value.trim();
        const statusType = parseInt(row.querySelector('.task-status-type').value) || 1;
        const date = row.querySelector('.task-target-date').value;
        const isCompleted = row.querySelector('.task-is-completed').checked;
        if (name) {
            tasks.push({
                id: id || null,
                task_name: name,
                status_type: statusType,
                target_date: date,
                is_completed: isCompleted ? 1 : 0
            });
        }
    });
    
    const valueStr = document.getElementById('input-value').value.replace(/\./g, '');
    const contractData = {
        contract_code: document.getElementById('input-code').value.trim(),
        partner_name: document.getElementById('input-partner').value.trim(),
        value: parseFloat(valueStr) || 0,
        start_date: document.getElementById('input-start-date').value,
        end_date: document.getElementById('input-end-date').value,
        progress_notes: document.getElementById('input-notes').value.trim(),
        installments: installments,
        tasks: tasks
    };
    
    const editId = document.getElementById('edit-contract-id').value;
    const url = editId ? `/api/contracts/${editId}` : '/api/contracts';
    const method = editId ? 'PUT' : 'POST';
    
    try {
        const response = await fetch(url, {
            method: method,
            headers: { 
                'Content-Type': 'application/json',
                'X-Passcode': appState.passcode
            },
            body: JSON.stringify(contractData)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Lỗi lưu thông tin hợp đồng.');
        }
        
        closeModal('add-contract-modal');
        showNotification(result.message, 'success');
        refreshCurrentTab();
    } catch (error) {
        errorMsg.innerText = error.message;
    }
}

// XỬ LÝ PHÂN TÍCH AI TỪ FILE WORD
async function handleParseAI() {
    const fileInput = document.getElementById('input-contract-file');
    const loadingMsg = document.getElementById('ai-loading-msg');
    const errorMsg = document.getElementById('add-error-msg');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        showNotification('Vui lòng chọn một file Word (.docx) trước khi phân tích.', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    
    loadingMsg.style.display = 'block';
    errorMsg.innerText = '';
    
    try {
        const response = await fetch('/api/parse-contract', {
            method: 'POST',
            headers: {
                'X-Passcode': appState.passcode
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Lỗi phân tích AI.');
        }
        
        // Điền dữ liệu vào form
        const data = result.data;
        if (data.contract_code) document.getElementById('input-code').value = data.contract_code;
        if (data.partner_name) document.getElementById('input-partner').value = data.partner_name;
        if (data.value) {
            document.getElementById('input-value').value = data.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            document.getElementById('value-preview').innerText = formatCurrency(data.value);
        }
        if (data.start_date) setFlatpickrDate('input-start-date', data.start_date);
        if (data.end_date) setFlatpickrDate('input-end-date', data.end_date);
        
        // Tạo các đợt thanh toán
        const container = document.getElementById('installments-container');
        container.innerHTML = '';
        if (data.installments && data.installments.length > 0) {
            data.installments.forEach(inst => {
                addInstallmentRow(inst.amount, inst.deadline_date);
            });
        }
        
        // Tạo các công việc checklist đề xuất từ AI
        const taskContainer = document.getElementById('tasks-container');
        taskContainer.innerHTML = '';
        if (data.tasks && data.tasks.length > 0) {
            data.tasks.forEach(t => {
                addTaskRow(t.task_name, t.status_type, t.target_date);
            });
        }
        
        showNotification('AI đã đọc dữ liệu hợp đồng thành công!', 'success');
    } catch (error) {
        errorMsg.innerText = error.message;
    } finally {
        loadingMsg.style.display = 'none';
        fileInput.value = ''; // Reset file input
    }
}

// THÊM DÒNG ĐỢT THANH TOÁN
function addInstallmentRow(amount = '', date = '', id = '', isPaid = false, paidDate = '') {
    const container = document.getElementById('installments-container');
    const row = document.createElement('div');
    row.className = 'installment-row form-row';
    row.style.marginBottom = '10px';
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.alignItems = 'center';
    
    row.innerHTML = `
        <input type="hidden" class="inst-id" value="${id}">
        <div class="form-group" style="flex: 2; margin-bottom: 0;">
            <input type="text" class="inst-amount" placeholder="Số tiền (VND)" value="${amount ? amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : ''}" oninput="formatNumberInput(this)">
        </div>
        <div class="form-group" style="flex: 2; margin-bottom: 0;">
            <label style="font-size:11px; margin-bottom:2px; color:#94a3b8; display:block;">Hạn thanh toán</label>
            <input type="date" class="inst-date" placeholder="dd/mm/yyyy" value="${date}">
        </div>
        <div class="form-group" style="flex: 2; margin-bottom: 0; display:flex; flex-direction:column;">
            <label style="font-size:11px; margin-bottom:2px; display:flex; align-items:center; gap:5px; cursor:pointer; color:#94a3b8;">
                <input type="checkbox" class="inst-is-paid" ${isPaid ? 'checked' : ''} onchange="this.parentElement.nextElementSibling.style.display = this.checked ? 'block' : 'none'"> 
                Đã TT
            </label>
            <div style="display: ${isPaid ? 'block' : 'none'};">
                <input type="date" class="inst-paid-date" placeholder="dd/mm/yyyy" value="${paidDate}" style="padding: 5px; font-size:11px; width: 100%;">
            </div>
        </div>
        <button type="button" class="btn btn-danger btn-small" onclick="this.parentElement.remove()" style="padding: 10px; flex-shrink: 0;" title="Xóa đợt">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
    
    container.appendChild(row);
    initFlatpickr(row.querySelectorAll('input[type="date"]'));
}

// THÊM DÒNG CÔNG VIỆC CHECKLIST TRONG MODAL
function addTaskRow(task_name = '', status_type = 1, date = '', id = '', isCompleted = false) {
    const container = document.getElementById('tasks-container');
    const row = document.createElement('div');
    row.className = 'task-row form-row';
    row.style.marginBottom = '10px';
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.alignItems = 'center';
    
    const statusOptions = [
        { val: 1, text: "1. Chờ ký kết" },
        { val: 2, text: "2. Hoàn thiện giấy tờ" },
        { val: 3, text: "3. Giục đặt cọc/thanh toán" },
        { val: 4, text: "4. Làm & gửi nghiệm thu" },
        { val: 5, text: "5. Làm & gửi hóa đơn" },
        { val: 6, text: "6. Giục thanh toán tiền" }
    ];

    const selectHTML = statusOptions.map(opt => `
        <option value="${opt.val}" ${status_type == opt.val ? 'selected' : ''}>${opt.text}</option>
    `).join('');

    row.innerHTML = `
        <input type="hidden" class="task-id" value="${id}">
        <div class="form-group" style="flex: 3; margin-bottom: 0;">
            <input type="text" class="task-name" placeholder="Tên công việc cần làm..." value="${escapeHTML(task_name)}" style="width: 100%;">
        </div>
        <div class="form-group" style="flex: 2; margin-bottom: 0;">
            <select class="task-status-type" style="padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: rgba(15,23,42,0.45); color: #fff; width: 100%; font-size: 13px; height: 38px;">
                ${selectHTML}
            </select>
        </div>
        <div class="form-group" style="flex: 2; margin-bottom: 0;">
            <input type="date" class="task-target-date" placeholder="dd/mm/yyyy" value="${date}">
        </div>
        <div class="form-group" style="flex: 1; margin-bottom: 0; display:flex; align-items:center; justify-content:center;">
            <label style="font-size:11px; display:flex; align-items:center; gap:5px; cursor:pointer; color:#94a3b8; margin: 0;">
                <input type="checkbox" class="task-is-completed" ${isCompleted ? 'checked' : ''}> 
                Xong
            </label>
        </div>
        <button type="button" class="btn btn-danger btn-small" onclick="this.parentElement.remove()" style="padding: 10px; flex-shrink: 0;" title="Xóa việc">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
    
    container.appendChild(row);
    initFlatpickr(row.querySelectorAll('input[type="date"]'));
}

// CẬP NHẬT TRẠNG THÁI HOÀN THÀNH CỦA TASK
async function handleTaskCompletion(taskId, checkbox) {
    const isCompleted = checkbox.checked;
    try {
        const response = await fetch(`/api/tasks/${taskId}/complete`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Passcode': appState.passcode
            },
            body: JSON.stringify({ is_completed: isCompleted })
        });
        
        const result = await response.json();
        if (!response.ok) {
            checkbox.checked = !isCompleted;
            throw new Error(result.error || 'Lỗi cập nhật trạng thái công việc.');
        }
        
        showNotification('Cập nhật công việc thành công!', 'success');
        
        // Cập nhật giao diện trực tiếp
        const item = checkbox.closest('.task-card-item');
        if (item) {
            const textEl = item.querySelector('.task-text');
            if (isCompleted) {
                item.classList.add('completed');
                if (textEl) {
                    textEl.style.textDecoration = 'line-through';
                    textEl.style.color = 'var(--text-muted)';
                }
            } else {
                item.classList.remove('completed');
                if (textEl) {
                    textEl.style.textDecoration = 'none';
                    textEl.style.color = '#fff';
                }
            }
        }
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// MỞ MODAL THÊM HỢP ĐỒNG
function openAddContractModal() {
    if (!appState.isAdmin) return;
    document.getElementById('modal-contract-title').innerHTML = '<i class="fa-solid fa-file-circle-plus"></i> Thêm Hợp Đồng Mới';
    document.getElementById('edit-contract-id').value = '';
    document.getElementById('add-contract-form').reset();
    setFlatpickrDate('input-start-date', '');
    setFlatpickrDate('input-end-date', '');
    document.getElementById('installments-container').innerHTML = '';
    document.getElementById('tasks-container').innerHTML = '';
    document.getElementById('value-preview').innerText = '0 VND';
    document.getElementById('add-error-msg').innerText = '';
    openModal('add-contract-modal');
}

// MỞ MODAL SỬA HỢP ĐỒNG
async function openEditContractModal(id, event) {
    if (event) event.stopPropagation();
    if (!appState.isAdmin) return;

    try {
        const response = await fetch(`/api/contracts/${id}`);
        const contract = await response.json();
        
        if (!response.ok || !contract) throw new Error(contract.error || "Không tìm thấy hợp đồng");

        document.getElementById('modal-contract-title').innerHTML = '<i class="fa-solid fa-file-pen"></i> Chỉnh Sửa Hợp Đồng';
        document.getElementById('edit-contract-id').value = contract.id;
        document.getElementById('input-code').value = contract.contract_code;
        document.getElementById('input-partner').value = contract.partner_name;
        document.getElementById('input-value').value = contract.value ? contract.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : '';
        setFlatpickrDate('input-start-date', contract.start_date);
        setFlatpickrDate('input-end-date', contract.end_date);
        document.getElementById('input-notes').value = contract.progress_notes || '';
        
        const preview = document.getElementById('value-preview');
        preview.innerText = formatCurrency(contract.value || 0);
        preview.style.color = '#34d399';

        document.getElementById('installments-container').innerHTML = '';
        if (contract.installments && contract.installments.length > 0) {
            contract.installments.forEach(inst => {
                addInstallmentRow(inst.amount, inst.deadline_date, inst.id, inst.is_paid, inst.paid_date || '');
            });
        }

        document.getElementById('tasks-container').innerHTML = '';
        if (contract.tasks && contract.tasks.length > 0) {
            contract.tasks.forEach(t => {
                addTaskRow(t.task_name, t.status_type, t.target_date, t.id, t.is_completed === 1 || t.is_completed === true);
            });
        }

        document.getElementById('add-error-msg').innerText = '';
        openModal('add-contract-modal');
    } catch (e) {
        showNotification(e.message, 'error');
    }
}

// CẬP NHẬT TRẠNG THÁI THANH TOÁN ĐỢT
async function handleInstallmentPayment(installmentId, checkbox) {
    const datePicker = document.getElementById(`inst-date-${installmentId}`);
    const isPaid = checkbox.checked;
    const paidDate = datePicker.value;
    
    try {
        const response = await fetch(`/api/installments/${installmentId}/pay`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Passcode': appState.passcode
            },
            body: JSON.stringify({ is_paid: isPaid, paid_date: paidDate })
        });
        
        const result = await response.json();
        if (!response.ok) {
            // Revert checkbox
            checkbox.checked = !isPaid;
            throw new Error(result.error || 'Lỗi cập nhật thanh toán.');
        }
        
        showNotification('Cập nhật đợt thanh toán thành công!', 'success');
        // Không refresh cả tab để tránh mất scroll, UI đã tự cập nhật checkbox
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// MỞ MODAL SỬA TIẾN ĐỘ HỢP ĐỒNG
function openEditNotesModal(id, code, partner, currentNotes) {
    if (!appState.isAdmin) return;
    
    document.getElementById('edit-contract-id').value = id;
    document.getElementById('brief-code').innerText = code;
    document.getElementById('brief-partner').innerText = partner;
    document.getElementById('edit-notes').value = currentNotes;
    document.getElementById('edit-error-msg').innerText = '';
    
    openModal('edit-notes-modal');
    document.getElementById('edit-notes').focus();
}

// XỬ LÝ LƯU CẬP NHẬT GHI CHÚ TIẾN ĐỘ HỢP ĐỒNG
async function handleEditNotesSubmit(event) {
    event.preventDefault();
    const errorMsg = document.getElementById('edit-error-msg');
    errorMsg.innerText = '';
    
    const contractId = document.getElementById('edit-contract-id').value;
    const progress_notes = document.getElementById('edit-notes').value.trim();
    
    try {
        const response = await fetch(`/api/contracts/${contractId}/notes`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Passcode': appState.passcode
            },
            body: JSON.stringify({ progress_notes })
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Lỗi cập nhật ghi chú.');
        
        closeModal('edit-notes-modal');
        showNotification(result.message, 'success');
        refreshCurrentTab();
    } catch (error) {
        errorMsg.innerText = error.message;
    }
}

// ĐÁNH DẤU HOÀN THÀNH HỢP ĐỒNG
async function handleMarkComplete(id, event) {
    event.preventDefault(); // Ngăn ô checkbox tích lập tức khi chưa hoàn tất API
    
    if (!appState.isAdmin) {
        showNotification('Bạn không có quyền thực hiện hành động này.', 'error');
        return;
    }
    
    if (confirm('Bạn có chắc chắn muốn đánh dấu HOÀN THÀNH cho hợp đồng này?\nHợp đồng sẽ được lưu trữ sang mục "Đã hoàn thành".')) {
        try {
            const response = await fetch(`/api/contracts/${id}/complete`, {
                method: 'PUT',
                headers: {
                    'X-Passcode': appState.passcode
                }
            });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Lỗi cập nhật trạng thái.');
            
            showNotification(result.message, 'success');
            refreshCurrentTab();
        } catch (error) {
            showNotification(error.message, 'error');
        }
    }
}

// HOÀN TÁC TRẠNG THÁI HỢP ĐỒNG VỀ ĐANG XỬ LÝ
async function handleRevertContract(id, event) {
    if (event) event.preventDefault();
    
    if (!appState.isAdmin) {
        showNotification('Bạn không có quyền thực hiện hành động này.', 'error');
        return;
    }
    
    if (confirm('Bạn có muốn hoàn tác hợp đồng này về trạng thái "Đang xử lý"?')) {
        try {
            const response = await fetch(`/api/contracts/${id}/revert`, {
                method: 'PUT',
                headers: {
                    'X-Passcode': appState.passcode
                }
            });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Lỗi hoàn tác trạng thái.');
            
            showNotification(result.message, 'success');
            refreshCurrentTab();
        } catch (error) {
            showNotification(error.message, 'error');
        }
    }
}

// XÓA HỢP ĐỒNG KHỎI HỆ THỐNG
async function handleDeleteContract(id, code, event) {
    if (event) event.preventDefault();
    
    if (!appState.isAdmin) {
        showNotification('Bạn không có quyền thực hiện hành động này.', 'error');
        return;
    }
    
    if (confirm(`CẢNH BÁO: Bạn có chắc chắn muốn XÓA VĨNH VIỄN hợp đồng mã [ ${code} ] khỏi hệ thống?\nHành động này không thể phục hồi!`)) {
        try {
            const response = await fetch(`/api/contracts/${id}`, {
                method: 'DELETE',
                headers: {
                    'X-Passcode': appState.passcode
                }
            });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Lỗi khi xóa hợp đồng.');
            
            showNotification(result.message, 'success');
            refreshCurrentTab();
        } catch (error) {
            showNotification(error.message, 'error');
        }
    }
}

// ----------------- CÁC TIỆN ÍCH PHỤ TRỢ (HELPERS) -----------------
async function openSettingsModal() {
    if (!appState.isAdmin) return;
    
    // Fetch current config
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        document.getElementById('settings-gemini-key').value = config.gemini_api_key || '';
        document.getElementById('settings-ngrok-token').value = config.ngrok_token || '';
        document.getElementById('settings-passcode').value = ''; // Don't show current passcode plainly
        document.getElementById('settings-telegram-enabled').checked = config.telegram_enabled || false;
        document.getElementById('settings-telegram-time').value = config.telegram_time || '09:00';
        document.getElementById('settings-telegram-token').value = config.telegram_bot_token || '';
        document.getElementById('settings-telegram-chatid').value = config.telegram_chat_id || '';
        document.getElementById('settings-error-msg').innerText = '';
        openModal('settings-modal');
    } catch (e) {
        showNotification('Lỗi lấy cấu hình: ' + e.message, 'error');
    }
}

async function handleSettingsSubmit(event) {
    event.preventDefault();
    const errorMsg = document.getElementById('settings-error-msg');
    errorMsg.innerText = '';
    
    const data = {
        gemini_api_key: document.getElementById('settings-gemini-key').value.trim(),
        ngrok_token: document.getElementById('settings-ngrok-token').value.trim(),
        telegram_enabled: document.getElementById('settings-telegram-enabled').checked,
        telegram_time: document.getElementById('settings-telegram-time').value,
        telegram_bot_token: document.getElementById('settings-telegram-token').value.trim(),
        telegram_chat_id: document.getElementById('settings-telegram-chatid').value.trim()
    };
    
    const newPasscode = document.getElementById('settings-passcode').value.trim();
    if (newPasscode) {
        data.passcode = newPasscode;
    }
    
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error || 'Lỗi lưu cài đặt');
        
        showNotification('Đã lưu cài đặt thành công!', 'success');
        if (newPasscode) {
            appState.passcode = newPasscode;
            localStorage.setItem('admin_passcode', newPasscode);
        }
        closeModal('settings-modal');
    } catch (error) {
        errorMsg.innerText = error.message;
    }
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Hiển thị mật khẩu trong modal đăng nhập
function togglePasswordVisibility() {
    const pwdInput = document.getElementById('admin-passcode');
    const eyeIcon = document.querySelector('#toggle-pwd-btn i');
    if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        eyeIcon.className = 'fa-solid fa-eye-slash';
    } else {
        pwdInput.type = 'password';
        eyeIcon.className = 'fa-solid fa-eye';
    }
}

// Định dạng ngày hiển thị (VD: 2026-05-28 -> 28/05/2026)
function formatDate(dateString) {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Định dạng tiền tệ VND (VD: 150000000 -> 150.000.000 VND)
function formatCurrency(value) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
        .format(value)
        .replace(/\s?₫/, ' VND'); // Thay đổi chữ đ thành VND
}

// Tránh lỗi tấn công script (XSS)
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

// Tránh lỗi khi nhúng chuỗi vào thuộc tính HTML
function escapeQuote(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'")
              .replace(/"/g, '&quot;');
}

// Hiển thị thông báo nhỏ trên góc màn hình (Toast Notifications)
function showNotification(message, type = 'success') {
    // Tạo container nếu chưa có
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.style.position = 'fixed';
        container.style.top = '24px';
        container.style.right = '24px';
        container.style.zIndex = '9999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        document.body.appendChild(container);
    }
    
    // Tạo thẻ notification
    const notification = document.createElement('div');
    notification.className = `notification-toast toast-${type}`;
    
    // Thiết lập icon theo loại
    let iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-xmark';
    if (type === 'info') iconClass = 'fa-circle-info';
    
    notification.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <span>${message}</span>
    `;
    
    // Áp dụng Style cho Toast
    Object.assign(notification.style, {
        background: type === 'success' ? 'rgba(52, 211, 153, 0.95)' : 
                    type === 'error' ? 'rgba(248, 113, 113, 0.95)' : 'rgba(56, 189, 248, 0.95)',
        color: '#0f172a',
        padding: '12px 20px',
        borderRadius: '10px',
        fontWeight: '600',
        fontSize: '0.9rem',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        animation: 'slideIn 0.3s ease-out',
        backdropFilter: 'blur(8px)'
    });
    
    // Thêm animation CSS vào document nếu chưa có
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.innerHTML = `
            @keyframes slideIn {
                from { transform: translateX(120%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes fadeOut {
                to { opacity: 0; transform: translateY(-10px); }
            }
        `;
        document.head.appendChild(style);
    }
    
    container.appendChild(notification);
    
    // Tự động xóa thông báo sau 3.5 giây
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.5s forwards';
        setTimeout(() => {
            notification.remove();
        }, 500);
    }, 3500);
}

// ----------------- SOẠN THẢO HỢP ĐỒNG AI -----------------
let aiWriterHistory = [];

function setContractEditorContent(text) {
    const editor = document.getElementById('contract-paper-editor');
    if (!editor) return;
    if (!text) {
        editor.innerHTML = '';
        return;
    }
    
    const lines = text.split('\n');
    let html = '';
    let inTable = false;
    let tableHtml = '';
    let inHeader = true;
    const headerEndKeywords = ['căn cứ', 'hôm nay', 'bên a', 'bên b', 'điều', 'đại diện', 'mã số thuế', 'địa chỉ'];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Kiểm tra xem dòng này có phải là phần ký tên 2 cột không
        const sigMatch = line.match(/^(.+?)(?:\s{4,}|\t+)(.+)$/);
        
        if (sigMatch) {
            inHeader = false;
            const part1 = sigMatch[1].trim();
            const part2 = sigMatch[2].trim();
            
            const isBold1 = part1.startsWith('ĐẠI DIỆN') || part1.startsWith('Đại diện') || part1 === part1.toUpperCase();
            const isBold2 = part2.startsWith('ĐẠI DIỆN') || part2.startsWith('Đại diện') || part2 === part2.toUpperCase();
            
            const style1 = isBold1 ? 'font-weight: bold;' : '';
            const style2 = isBold2 ? 'font-weight: bold;' : '';
            
            if (!inTable) {
                inTable = true;
                tableHtml = '<table style="width: 100%; border: none; border-collapse: collapse; margin-top: 15px; margin-bottom: 5px; font-family: \'Times New Roman\', Times, serif; font-size: 1.05rem; line-height: 1.6;">';
            }
            
            tableHtml += `<tr>
                <td style="width: 50%; text-align: center; border: none; padding: 2px 0; ${style1}">${escapeHTML(part1)}</td>
                <td style="width: 50%; text-align: center; border: none; padding: 2px 0; ${style2}">${escapeHTML(part2)}</td>
            </tr>`;
        } else if (trimmed === '' && inTable) {
            // Giữ bảng mở và thêm dòng trống
            tableHtml += `<tr>
                <td style="width: 50%; text-align: center; border: none; padding: 2px 0;">&nbsp;</td>
                <td style="width: 50%; text-align: center; border: none; padding: 2px 0;">&nbsp;</td>
            </tr>`;
        } else {
            // Đóng bảng nếu đang mở
            if (inTable) {
                tableHtml += '</table>';
                html += tableHtml;
                inTable = false;
                tableHtml = '';
            }
            
            // Xử lý dòng bình thường
            const isSeparator = trimmed.length > 0 && trimmed.length <= 30 && Array.from(trimmed).every(c => '-_* '.includes(c));
            
            if (inHeader && !isSeparator) {
                const trimmedLower = trimmed.toLowerCase();
                if (headerEndKeywords.some(keyword => trimmedLower.startsWith(keyword)) || 
                    trimmed.startsWith('-') || trimmed.startsWith('•')) {
                    inHeader = false;
                }
            }
            
            const isCenter = inHeader && trimmed.length > 0;
            const isBold = trimmed.startsWith('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM') || 
                           trimmed.startsWith('Độc lập - Tự do - Hạnh phúc') || 
                           trimmed.startsWith('HỢP ĐỒNG') ||
                           trimmed.startsWith('ĐIỀU') || 
                           trimmed.startsWith('BÊN');
                           
            let styles = [];
            if (isCenter) {
                styles.push('text-align: center');
            }
            if (isBold) {
                styles.push('font-weight: bold');
            }
            
            const displayText = trimmed === '' ? '&nbsp;' : escapeHTML(line);
            
            if (styles.length > 0) {
                html += `<p style="${styles.join('; ')}">${displayText}</p>`;
            } else {
                html += `<p>${displayText}</p>`;
            }
        }
    }
    
    // Đóng bảng nếu kết thúc văn bản mà bảng vẫn mở
    if (inTable) {
        tableHtml += '</table>';
        html += tableHtml;
    }
    
    editor.innerHTML = html;
}

async function handleAiChatSend() {
    const inputEl = document.getElementById('ai-chat-input');
    const text = inputEl.value.trim();
    if (!text) return;
    
    inputEl.value = '';
    inputEl.style.height = '42px';
    
    // Thêm tin nhắn của User
    appendWriterChatMessage('user', text);
    aiWriterHistory.push({ role: 'user', content: text });
    
    // Hiển thị hiệu ứng gõ chữ
    showWriterTyping(true);
    
    const templateSelect = document.getElementById('writer-template-select');
    const templateId = templateSelect.value;
    
    try {
        const response = await fetch('/api/ai-writer/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Passcode': appState.passcode
            },
            body: JSON.stringify({
                messages: aiWriterHistory,
                template_id: templateId
            })
        });
        
        const result = await response.json();
        showWriterTyping(false);
        
        if (!response.ok) {
            throw new Error(result.error || 'Lỗi gọi API AI.');
        }
        
        const data = result.data;
        const chatResponse = data.chat_response;
        const contractDraft = data.contract_draft;
        
        appendWriterChatMessage('assistant', chatResponse);
        aiWriterHistory.push({ role: 'assistant', content: chatResponse });
        
        // Cập nhật khung soạn thảo văn bản bên phải
        if (contractDraft) {
            setContractEditorContent(contractDraft);
        }
    } catch (error) {
        showWriterTyping(false);
        appendWriterChatMessage('system', 'Lỗi: ' + error.message);
    }
}

function appendWriterChatMessage(role, text) {
    const chatArea = document.getElementById('ai-chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.innerHTML = `<div class="message-content">${escapeHTML(text).replace(/\n/g, '<br>')}</div>`;
    chatArea.appendChild(msgDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function showWriterTyping(show) {
    const chatArea = document.getElementById('ai-chat-messages');
    const existing = document.getElementById('writer-typing-bubble');
    if (show) {
        if (existing) return;
        const bubble = document.createElement('div');
        bubble.id = 'writer-typing-bubble';
        bubble.className = 'typing-bubble';
        bubble.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        chatArea.appendChild(bubble);
        chatArea.scrollTop = chatArea.scrollHeight;
    } else {
        if (existing) existing.remove();
    }
}

async function exportContractToWord() {
    const text = document.getElementById('contract-paper-editor').innerText.trim();
    if (!text) {
        showNotification('Chưa có nội dung hợp đồng để xuất bản.', 'error');
        return;
    }
    
    showNotification('Đang tạo và tải file Word (.docx) xuống...', 'info');
    
    try {
        const response = await fetch('/api/ai-writer/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ contract_text: text })
        });
        
        if (!response.ok) {
            throw new Error('Lỗi xuất file từ máy chủ.');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "Hop_Dong_Soan_Thao_AI.docx";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showNotification('Tải file Word thành công!', 'success');
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function saveDraftToSystem() {
    const text = document.getElementById('contract-paper-editor').innerText.trim();
    if (!text) {
        showNotification('Chưa có nội dung bản thảo để lưu.', 'error');
        return;
    }
    
    showNotification('AI đang phân tích và trích xuất thông tin hợp đồng...', 'info');
    
    try {
        const response = await fetch('/api/parse-contract-text', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Passcode': appState.passcode
            },
            body: JSON.stringify({ contract_text: text })
        });
        
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Lỗi trích xuất thông tin.');
        }
        
        const data = result.data;
        
        // Reset form
        document.getElementById('add-contract-form').reset();
        document.getElementById('edit-contract-id').value = '';
        document.getElementById('add-error-msg').innerText = '';
        
        // Điền dữ liệu trích xuất được vào Modal
        if (data.contract_code) document.getElementById('input-code').value = data.contract_code;
        if (data.partner_name) document.getElementById('input-partner').value = data.partner_name;
        if (data.value) {
            document.getElementById('input-value').value = data.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            document.getElementById('value-preview').innerText = formatCurrency(data.value);
        }
        if (data.start_date) setFlatpickrDate('input-start-date', data.start_date);
        if (data.end_date) setFlatpickrDate('input-end-date', data.end_date);
        
        // Ghi chú tiến độ mặc định
        document.getElementById('input-notes').value = `Hợp đồng soạn thảo từ AI ngày ${new Date().toLocaleDateString('vi-VN')}`;
        
        // Thêm đợt thanh toán
        const instContainer = document.getElementById('installments-container');
        instContainer.innerHTML = '';
        if (data.installments && data.installments.length > 0) {
            data.installments.forEach(inst => {
                addInstallmentRow(inst.amount, inst.deadline_date);
            });
        }
        
        // Thêm các công việc checklist
        const taskContainer = document.getElementById('tasks-container');
        taskContainer.innerHTML = '';
        if (data.tasks && data.tasks.length > 0) {
            data.tasks.forEach(t => {
                addTaskRow(t.task_name, t.status_type, t.target_date);
            });
        }
        
        // Mở Modal để người dùng duyệt và bấm Lưu
        document.getElementById('modal-contract-title').innerHTML = '<i class="fa-solid fa-file-circle-plus"></i> Lưu Hợp Đồng Từ Bản Thảo AI';
        openModal('add-contract-modal');
        showNotification('Trích xuất thành công! Hãy duyệt lại trước khi Lưu.', 'success');
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// ----------------- QUẢN LÝ MẪU HỢP ĐỒNG -----------------
let currentTemplates = [];

async function loadTemplatesDropdown() {
    try {
        const response = await fetch('/api/ai-writer/templates');
        if (!response.ok) throw new Error('Không thể tải danh sách mẫu.');
        currentTemplates = await response.json();
        
        const selectEl = document.getElementById('writer-template-select');
        if (selectEl) {
            selectEl.innerHTML = '<option value="">Không dùng mẫu (AI tự soạn)</option>';
            currentTemplates.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name;
                selectEl.appendChild(opt);
            });
        }
    } catch (error) {
        console.error("[AI Templates] Error load templates dropdown:", error);
    }
}

// Mở Modal Quản Lý Mẫu Hợp Đồng
async function openTemplatesModal() {
    if (!appState.isAdmin) return;
    
    toggleTemplateForm(false); // Đóng form soạn thảo mẫu nếu đang mở
    openModal('templates-modal');
    await loadTemplatesListTable();
}

// Load danh sách mẫu vẽ vào bảng
async function loadTemplatesListTable() {
    const tableBody = document.getElementById('templates-table-body');
    tableBody.innerHTML = `
        <tr>
            <td colspan="2" style="text-align: center; color: var(--text-secondary);">
                <i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải dữ liệu...
            </td>
        </tr>
    `;
    
    try {
        const response = await fetch('/api/ai-writer/templates');
        if (!response.ok) throw new Error('Không thể lấy danh sách mẫu.');
        currentTemplates = await response.json();
        
        if (currentTemplates.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="2" style="text-align: center; color: var(--text-secondary);">
                        Chưa có bản mẫu hợp đồng nào trong hệ thống.
                    </td>
                </tr>
            `;
            return;
        }
        
        tableBody.innerHTML = '';
        currentTemplates.forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 500; color: #fff;">${escapeHTML(t.name)}</td>
                <td style="text-align: center;">
                    <button class="btn-action-edit" onclick="editTemplate(${t.id})" title="Chỉnh sửa mẫu này">
                        <i class="fa-solid fa-pen-to-square"></i> Sửa
                    </button>
                    <button class="btn-action-delete" onclick="deleteTemplate(${t.id})" title="Xóa mẫu này">
                        <i class="fa-solid fa-trash-can"></i> Xóa
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (error) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="2" style="text-align: center; color: var(--color-danger);">
                    Lỗi: ${error.message}
                </td>
            </tr>
        `;
    }
}
// Ẩn/Hiện Form Thêm/Sửa Mẫu
function toggleTemplateForm(show, templateId = null) {
    const wrapper = document.getElementById('template-editor-form-wrapper');
    const form = document.getElementById('template-editor-form');
    const titleEl = document.getElementById('template-form-title');
    const errorEl = document.getElementById('template-error-msg');
    const fileEl = document.getElementById('template-file-input');
    
    errorEl.innerText = '';
    if (fileEl) fileEl.value = '';
    
    if (show) {
        wrapper.style.display = 'block';
        if (templateId) {
            titleEl.innerHTML = '<i class="fa-solid fa-edit"></i> Chỉnh Sửa Mẫu Hợp Đồng';
            const tmpl = currentTemplates.find(t => t.id === templateId);
            if (tmpl) {
                document.getElementById('template-id-input').value = tmpl.id;
                document.getElementById('template-name-input').value = tmpl.name;
                document.getElementById('template-content-input').value = tmpl.content;
            }
        } else {
            titleEl.innerHTML = '<i class="fa-solid fa-plus"></i> Thêm Mẫu Hợp Đồng Mới';
            form.reset();
            document.getElementById('template-id-input').value = '';
        }
        // Cuộn xuống khu vực Form soạn thảo
        setTimeout(() => {
            wrapper.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    } else {
        wrapper.style.display = 'none';
        form.reset();
        document.getElementById('template-id-input').value = '';
    }
}

// Kích hoạt sửa mẫu
function editTemplate(id) {
    toggleTemplateForm(true, id);
}

// Xử lý Lưu mẫu hợp đồng (POST / PUT)
async function handleTemplateSave(event) {
    event.preventDefault();
    if (!appState.isAdmin) return;
    
    const templateId = document.getElementById('template-id-input').value;
    const name = document.getElementById('template-name-input').value.trim();
    const content = document.getElementById('template-content-input').value.trim();
    const fileInput = document.getElementById('template-file-input');
    const errorEl = document.getElementById('template-error-msg');
    
    if (!name) {
        errorEl.innerText = 'Vui lòng điền Tên mẫu hợp đồng.';
        return;
    }
    
    const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
    if (!content && !hasFile) {
        errorEl.innerText = 'Vui lòng điền nội dung mẫu hợp đồng hoặc đính kèm file Word (.docx).';
        return;
    }
    
    // Sử dụng FormData để gửi kèm file tải lên
    const formData = new FormData();
    formData.append('name', name);
    formData.append('content', content);
    if (hasFile) {
        formData.append('file', fileInput.files[0]);
    }
    
    const url = templateId 
        ? `/api/ai-writer/templates/${templateId}`
        : '/api/ai-writer/templates';
    const method = templateId ? 'PUT' : 'POST';
    
    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'X-Passcode': appState.passcode
            },
            body: formData
        });
        
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Lỗi lưu bản mẫu.');
        }
        
        showNotification(result.message, 'success');
        toggleTemplateForm(false);
        await loadTemplatesListTable();
        await loadTemplatesDropdown(); // Cập nhật dropdown ở Tab Soạn Thảo
    } catch (error) {
        errorEl.innerText = error.message;
    }
}
// Xóa mẫu hợp đồng
async function deleteTemplate(id) {
    if (!appState.isAdmin) return;
    
    const tmpl = currentTemplates.find(t => t.id === id);
    if (!tmpl) return;
    
    if (confirm(`Bạn có chắc chắn muốn xóa bản mẫu hợp đồng "${tmpl.name}"? Hành động này không thể hoàn tác.`)) {
        try {
            const response = await fetch(`/api/ai-writer/templates/${id}`, {
                method: 'DELETE',
                headers: {
                    'X-Passcode': appState.passcode
                }
            });
            
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Lỗi khi xóa bản mẫu.');
            }
            
            showNotification(result.message, 'success');
            toggleTemplateForm(false);
            await loadTemplatesListTable();
            await loadTemplatesDropdown(); // Cập nhật dropdown
        } catch (error) {
            showNotification(error.message, 'error');
        }
    }
}

