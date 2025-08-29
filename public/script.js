// 全局变量
let tasks = [];
let projects = [];
let currentEditingTaskId = null;
let currentEditingProjectId = null;
let currentSelectedProjectId = '';
let taskToDelete = null;
let projectToDelete = null;

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    loadProjects();
    loadTasks();
    setupEventListeners();
    loadSettings();
});

// 设置事件监听器
function setupEventListeners() {
    // 搜索功能
    document.getElementById('searchInput').addEventListener('input', filterTasks);
    
    // 筛选功能
    document.getElementById('statusFilter').addEventListener('change', filterTasks);
    document.getElementById('priorityFilter').addEventListener('change', filterTasks);
    document.getElementById('timeFilter').addEventListener('change', filterTasks);
    
    // 表单提交
    document.getElementById('taskForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveTask();
    });
}

// 加载所有任务
async function loadTasks() {
    try {
        showLoading();
        const response = await fetch('/api/tasks');
        if (!response.ok) throw new Error('加载任务失败');
        
        tasks = await response.json();
        renderTasks(tasks);
        updateStatistics();

        // 如果已经选择了项目，更新Tab内容
        if (currentSelectedProjectId !== undefined) {
            updateFlowchartTab();
            updateProgressTab();
        }
    } catch (error) {
        console.error('加载任务失败:', error);
        showError('加载任务失败，请刷新页面重试');
    } finally {
        hideLoading();
    }
}

// 渲染任务列表
function renderTasks(tasksToRender) {
    const container = document.getElementById('tasksContainer');
    
    if (tasksToRender.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-inbox"></i>
                <h5>暂无任务</h5>
                <p>点击"添加任务"按钮创建您的第一个任务</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = tasksToRender.map(task => createTaskCard(task)).join('');
}

// 创建任务卡片HTML
function createTaskCard(task) {
    const priorityClass = `priority-${task.priority}`;
    const statusClass = `status-${task.status}`;
    const dueDateInfo = getDueDateInfo(task.dueDate);

    return `
        <div class="task-card card ${priorityClass} ${statusClass} fade-in" data-task-id="${task.id}">
            <div class="card-body">
                <div class="task-header">
                    <h6 class="task-title">${escapeHtml(task.title)}</h6>
                    <div class="task-actions">
                        <button class="btn btn-outline-info btn-sm" onclick="pushToWebhook('${task.id}')" title="推送到WebHook">
                            <i class="bi bi-send"></i>
                        </button>
                        <button class="btn btn-outline-primary btn-sm" onclick="editTask('${task.id}')" title="编辑">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm" onclick="deleteTask('${task.id}')" title="删除">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
                
                <div class="task-meta">
                    <span class="priority-badge priority-${task.priority}">
                        ${getPriorityText(task.priority)}
                    </span>
                    <span class="status-badge ${statusClass}">
                        ${getStatusText(task.status)}
                    </span>
                    ${getProjectBadge(task.projectId)}
                    ${dueDateInfo.html}
                </div>
                
                ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
                
                <div class="task-footer">
                    <small class="task-footer-text">
                        创建时间: ${formatDate(task.createdAt)}
                        ${task.updatedAt ? ` | 更新时间: ${formatDate(task.updatedAt)}` : ''}
                    </small>
                </div>
            </div>
        </div>
    `;
}

// 获取截止日期信息
function getDueDateInfo(dueDate) {
    if (!dueDate) return { html: '', class: '' };
    
    const due = new Date(dueDate);
    const now = new Date();
    const diffTime = due - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let className = 'task-due-date';
    let text = `截止: ${formatDate(dueDate)}`;
    
    if (diffDays < 0) {
        className += ' overdue';
        text += ` (已逾期 ${Math.abs(diffDays)} 天)`;
    } else if (diffDays <= 3) {
        className += ' due-soon';
        if (diffDays === 0) text += ' (今天到期)';
        else text += ` (${diffDays} 天后到期)`;
    }
    
    return {
        html: `<span class="${className}"><i class="bi bi-calendar"></i> ${text}</span>`,
        class: className
    };
}

// 更新统计信息
function updateStatistics() {
    const total = tasks.length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const inProgress = tasks.filter(t => t.status === 'in-progress').length;
    const completed = tasks.filter(t => t.status === 'completed').length;

    document.getElementById('totalTasks').textContent = total;
    document.getElementById('pendingTasks').textContent = pending;
    document.getElementById('inProgressTasks').textContent = inProgress;
    document.getElementById('completedTasks').textContent = completed;

    // 同时更新侧边栏
    renderProjectsSidebar();
}

// 更新单个任务卡片的样式
function updateTaskCardStyle(taskId, newStatus, newPriority) {
    const taskCard = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskCard) return;

    // 移除旧的状态和优先级类
    taskCard.classList.remove('status-pending', 'status-in-progress', 'status-completed');
    taskCard.classList.remove('priority-high', 'priority-medium', 'priority-low');

    // 添加新的状态和优先级类
    taskCard.classList.add(`status-${newStatus}`);
    taskCard.classList.add(`priority-${newPriority}`);

    // 添加更新动画效果
    taskCard.style.transform = 'scale(1.02)';
    setTimeout(() => {
        taskCard.style.transform = 'scale(1)';
    }, 200);
}

// 筛选任务
function filterTasks() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const priorityFilter = document.getElementById('priorityFilter').value;
    const timeFilter = document.getElementById('timeFilter').value;

    const filteredTasks = tasks.filter(task => {
        const matchesSearch = task.title.toLowerCase().includes(searchTerm) ||
                            task.description.toLowerCase().includes(searchTerm);
        const matchesStatus = !statusFilter || task.status === statusFilter;
        const matchesPriority = !priorityFilter || task.priority === priorityFilter;
        const matchesTime = !timeFilter || matchesTimeFilter(task, timeFilter);

        return matchesSearch && matchesStatus && matchesPriority && matchesTime;
    });

    renderTasks(filteredTasks);
}

// 时间段筛选逻辑
function matchesTimeFilter(task, timeFilter) {
    if (!task.dueDate) {
        // 没有截止日期的任务只在"所有时间"中显示
        return false;
    }

    const now = new Date();
    const dueDate = new Date(task.dueDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    switch (timeFilter) {
        case 'today':
            // 今天到期
            return dueDate >= today && dueDate < tomorrow;

        case 'week':
            // 本周到期（从今天开始的7天内）
            const weekEnd = new Date(today);
            weekEnd.setDate(weekEnd.getDate() + 7);
            return dueDate >= today && dueDate < weekEnd;

        case 'month':
            // 本月到期
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            return dueDate >= monthStart && dueDate < monthEnd;

        case 'overdue':
            // 已逾期
            return dueDate < today;

        case 'upcoming':
            // 即将到期（未来3天内）
            const upcomingEnd = new Date(today);
            upcomingEnd.setDate(upcomingEnd.getDate() + 3);
            return dueDate >= today && dueDate < upcomingEnd;

        default:
            return true;
    }
}

// 清除所有筛选
function clearAllFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('priorityFilter').value = '';
    document.getElementById('timeFilter').value = '';

    // 重新渲染所有任务
    renderTasks(tasks);

    // 显示提示
    showSuccess('已清除所有筛选条件');
}

// 打开添加任务模态框
function openAddModal() {
    currentEditingTaskId = null;
    document.getElementById('modalTitle').textContent = '添加任务';
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    
    // 设置默认截止日期为明天
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('taskDueDate').value = tomorrow.toISOString().split('T')[0];
}

// 编辑任务
function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    currentEditingTaskId = taskId;
    document.getElementById('modalTitle').textContent = '编辑任务';
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description;
    document.getElementById('taskPriority').value = task.priority;
    document.getElementById('taskStatus').value = task.status;
    document.getElementById('taskDueDate').value = task.dueDate;
    document.getElementById('taskProject').value = task.projectId || '';
    
    const modal = new bootstrap.Modal(document.getElementById('taskModal'));
    modal.show();
}

// 保存任务
async function saveTask() {
    const title = document.getElementById('taskTitle').value.trim();
    if (!title) {
        showError('请输入任务标题');
        return;
    }
    
    const taskData = {
        title,
        description: document.getElementById('taskDescription').value.trim(),
        priority: document.getElementById('taskPriority').value,
        status: document.getElementById('taskStatus').value,
        dueDate: document.getElementById('taskDueDate').value,
        projectId: document.getElementById('taskProject').value || null
    };
    
    try {
        let response;
        if (currentEditingTaskId) {
            // 更新任务
            response = await fetch(`/api/tasks/${currentEditingTaskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });
        } else {
            // 创建新任务
            response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });
        }
        
        if (!response.ok) throw new Error('保存任务失败');
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('taskModal'));
        modal.hide();

        if (currentEditingTaskId) {
            // 如果是更新任务，先更新卡片样式，然后重新加载数据
            updateTaskCardStyle(currentEditingTaskId, taskData.status, taskData.priority);
            // 延迟重新加载以显示动画效果
            setTimeout(async () => {
                await loadTasks();
            }, 300);
        } else {
            // 如果是新任务，直接重新加载
            await loadTasks();
        }

        showSuccess(currentEditingTaskId ? '任务更新成功' : '任务创建成功');
        
    } catch (error) {
        console.error('保存任务失败:', error);
        showError('保存任务失败，请重试');
    }
}



// 删除任务
function deleteTask(taskId) {
    taskToDelete = taskId;
    const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
    modal.show();
}

// 确认删除任务
async function confirmDelete() {
    if (!taskToDelete) return;

    try {
        const response = await fetch(`/api/tasks/${taskToDelete}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('删除任务失败');

        const modal = bootstrap.Modal.getInstance(document.getElementById('deleteModal'));
        modal.hide();

        await loadTasks();
        showSuccess('任务删除成功');

    } catch (error) {
        console.error('删除任务失败:', error);
        showError('删除任务失败，请重试');
    } finally {
        taskToDelete = null;
    }
}

// 工具函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getPriorityText(priority) {
    const priorityMap = {
        'high': '高',
        'medium': '中',
        'low': '低'
    };
    return priorityMap[priority] || priority;
}

function getStatusText(status) {
    const statusMap = {
        'pending': '待处理',
        'in-progress': '进行中',
        'completed': '已完成'
    };
    return statusMap[status] || status;
}

function getProjectBadge(projectId) {
    if (!projectId) {
        return '<span class="project-badge no-project"><i class="bi bi-folder-x"></i> 无项目</span>';
    }

    const project = projects.find(p => p.id === projectId);
    if (!project) {
        return '<span class="project-badge unknown-project"><i class="bi bi-question-circle"></i> 未知项目</span>';
    }

    return `<span class="project-badge" style="background-color: ${project.color}20; color: ${project.color}; border: 1px solid ${project.color}40;">
        <i class="bi bi-folder"></i> ${escapeHtml(project.name)}
    </span>`;
}

function showLoading() {
    document.getElementById('tasksContainer').innerHTML = `
        <div class="loading">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">加载中...</span>
            </div>
        </div>
    `;
}

function hideLoading() {
    // Loading will be replaced by renderTasks
}

function showSuccess(message) {
    showToast(message, 'success');
}

function showError(message) {
    showToast(message, 'danger');
}

function showToast(message, type = 'info') {
    // 创建toast容器（如果不存在）
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
        toastContainer.style.zIndex = '9999';
        document.body.appendChild(toastContainer);
    }

    // 创建toast元素
    const toastId = 'toast-' + Date.now();
    const toastHtml = `
        <div id="${toastId}" class="toast align-items-center text-bg-${type} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', toastHtml);

    // 显示toast
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, {
        autohide: true,
        delay: 3000
    });

    toast.show();

    // 自动清理
    toastElement.addEventListener('hidden.bs.toast', function() {
        toastElement.remove();
    });
}

// 加载设置
function loadSettings() {
    const webhookUrl = localStorage.getItem('globalWebhookUrl');
    if (webhookUrl) {
        document.getElementById('globalWebhookUrl').value = webhookUrl;
    }
}

// 保存设置
function saveSettings() {
    const webhookUrl = document.getElementById('globalWebhookUrl').value.trim();

    // 验证URL格式（如果不为空）
    if (webhookUrl) {
        try {
            new URL(webhookUrl);
        } catch (e) {
            showError('请输入有效的WebHook URL');
            return;
        }
    }

    // 保存到localStorage
    localStorage.setItem('globalWebhookUrl', webhookUrl);

    // 关闭模态框
    const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
    modal.hide();

    showSuccess('设置保存成功');
}

// WebHook推送功能
function pushToWebhook(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
        showError('任务未找到');
        return;
    }

    // 检查是否配置了WebHook地址
    const webhookUrl = localStorage.getItem('globalWebhookUrl');
    if (!webhookUrl) {
        showError('请先在设置中配置WebHook地址');
        return;
    }

    // 设置任务ID（用于确认推送时使用）
    window.currentPushTaskId = taskId;

    // 显示WebHook地址
    document.getElementById('confirmWebhookUrl').textContent = webhookUrl;

    // 生成预览内容
    updateWebhookPreview(task);

    // 显示确认模态框
    const modal = new bootstrap.Modal(document.getElementById('webhookConfirmModal'));
    modal.show();
}

// 更新WebHook预览内容
function updateWebhookPreview(task) {
    const statusMap = {
        'pending': '⏳ 待处理',
        'in-progress': '🔄 进行中',
        'completed': '✅ 已完成'
    };

    const priorityMap = {
        'high': '🔴 高',
        'medium': '🟡 中',
        'low': '🟢 低'
    };

    const previewContent = `
        <strong>📋 任务状态推送通知</strong><br><br>
        <strong>任务标题：</strong> ${escapeHtml(task.title)}<br>
        <strong>任务描述：</strong> ${escapeHtml(task.description) || '无'}<br>
        <strong>任务状态：</strong> ${statusMap[task.status] || task.status}<br>
        <strong>优先级：</strong> ${priorityMap[task.priority] || task.priority}<br>
        <strong>截止日期：</strong> ${task.dueDate || '未设置'}<br>
        <strong>创建时间：</strong> ${formatDate(task.createdAt)}<br>
        ${task.updatedAt ? `<strong>更新时间：</strong> ${formatDate(task.updatedAt)}<br>` : ''}
        <hr>
        <em>来自工作任务计划表系统</em>
    `;

    document.getElementById('webhookPreview').innerHTML = previewContent;
}

// 确认WebHook推送
async function confirmWebhookPush() {
    const taskId = window.currentPushTaskId;
    const webhookUrl = localStorage.getItem('globalWebhookUrl');

    if (!taskId) {
        showError('任务ID丢失，请重新操作');
        return;
    }

    if (!webhookUrl) {
        showError('WebHook地址未配置');
        return;
    }

    try {
        // 发送推送请求
        const response = await fetch(`/api/tasks/${taskId}/webhook`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ webhookUrl })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            // 关闭模态框
            const modal = bootstrap.Modal.getInstance(document.getElementById('webhookConfirmModal'));
            modal.hide();

            showSuccess('任务推送成功！');
        } else {
            throw new Error(result.error || '推送失败');
        }

    } catch (error) {
        console.error('WebHook推送失败:', error);
        showError('推送失败: ' + error.message);
    } finally {
        // 清理临时变量
        window.currentPushTaskId = null;
    }
}

// ==================== 项目管理功能 ====================

// 加载所有项目
async function loadProjects() {
    try {
        const response = await fetch('/api/projects');
        if (!response.ok) throw new Error('加载项目失败');

        projects = await response.json();
        renderProjectsSidebar();
        updateProjectOptions();
        updateProjectManagementList();
    } catch (error) {
        console.error('加载项目失败:', error);
        showError('加载项目失败，请刷新页面重试');
    }
}

// 渲染侧边栏项目列表
function renderProjectsSidebar() {
    const container = document.getElementById('projectsList');
    if (!container) return;

    // 更新全部项目的任务数量
    const allProjectsCountElement = document.getElementById('allProjectsCount');
    if (allProjectsCountElement) {
        allProjectsCountElement.textContent = tasks.length;
    }

    if (projects.length === 0) {
        container.innerHTML = `
            <div class="text-center p-3 text-muted">
                <i class="bi bi-folder-x"></i>
                <div>暂无项目</div>
            </div>
        `;
        return;
    }

    container.innerHTML = projects.map(project => {
        const projectTasks = tasks.filter(task => task.projectId === project.id);
        const taskCount = projectTasks.length;

        return `
            <div class="project-item ${currentSelectedProjectId === project.id ? 'active' : ''}"
                 data-project-id="${project.id}"
                 onclick="selectProject('${project.id}')">
                <div class="project-color" style="background-color: ${project.color};"></div>
                <div class="project-info">
                    <div class="project-name" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</div>
                    <div class="project-count">${taskCount}</div>
                </div>
            </div>
        `;
    }).join('');
}

// 选择项目
function selectProject(projectId) {
    currentSelectedProjectId = projectId;

    // 更新侧边栏选中状态
    document.querySelectorAll('.project-item').forEach(item => {
        item.classList.remove('active');
    });

    const selectedItem = document.querySelector(`[data-project-id="${projectId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('active');
    }

    // 更新页面标题
    const titleElement = document.getElementById('currentProjectTitle');
    if (titleElement) {
        if (projectId === '') {
            titleElement.textContent = '全部项目';
        } else {
            const project = projects.find(p => p.id === projectId);
            titleElement.textContent = project ? project.name : '未知项目';
        }
    }

    // 显示/隐藏Tab容器
    const tabsContainer = document.getElementById('projectTabsContainer');
    const tabContent = document.getElementById('projectTabContent');
    if (tabsContainer && tabContent) {
        if (projectId === '') {
            // 显示全部项目时也显示Tab，但内容稍有不同
            tabsContainer.style.display = 'block';
            tabContent.style.display = 'block';
            // 默认激活任务列表Tab
            activateTab('tasks-tab');
            // 更新Tab标签文本以反映"全部项目"状态
            updateTabLabelsForAllProjects();
        } else {
            // 选择具体项目时显示Tab
            tabsContainer.style.display = 'block';
            tabContent.style.display = 'block';
            // 默认激活任务列表Tab
            activateTab('tasks-tab');
            // 恢复Tab标签文本为项目特定状态
            updateTabLabelsForProject();
        }
    }

    // 筛选并显示任务
    filterTasksByProject();

    // 更新Tab内容（无论是全部项目还是具体项目）
    updateFlowchartTab();
    updateProgressTab();
}

// 根据项目筛选任务
function filterTasksByProject() {
    let filteredTasks;

    if (currentSelectedProjectId === '') {
        // 显示所有任务
        filteredTasks = tasks;
    } else {
        // 显示指定项目的任务
        filteredTasks = tasks.filter(task => task.projectId === currentSelectedProjectId);
    }

    renderTasks(filteredTasks);
    updateStatisticsForProject(filteredTasks);
    renderProjectsSidebar(); // 确保侧边栏也更新
}

// 更新项目相关的统计信息
function updateStatisticsForProject(filteredTasks) {
    const total = filteredTasks.length;
    const pending = filteredTasks.filter(t => t.status === 'pending').length;
    const inProgress = filteredTasks.filter(t => t.status === 'in-progress').length;
    const completed = filteredTasks.filter(t => t.status === 'completed').length;

    document.getElementById('totalTasks').textContent = total;
    document.getElementById('pendingTasks').textContent = pending;
    document.getElementById('inProgressTasks').textContent = inProgress;
    document.getElementById('completedTasks').textContent = completed;
}

// 更新任务表单中的项目选项
function updateProjectOptions() {
    const select = document.getElementById('taskProject');
    if (!select) return;

    // 清空现有选项（保留"无项目"选项）
    select.innerHTML = '<option value="">无项目</option>';

    // 添加项目选项
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        select.appendChild(option);
    });
}

// 切换侧边栏显示/隐藏
function toggleSidebar() {
    const sidebar = document.getElementById('projectSidebar');
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        // 移动端：使用overlay模式
        sidebar.classList.toggle('show');

        // 添加或移除overlay
        let overlay = document.querySelector('.sidebar-overlay');
        if (sidebar.classList.contains('show')) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'sidebar-overlay';
                overlay.onclick = () => toggleSidebar();
                document.body.appendChild(overlay);
            }
            overlay.classList.add('show');
        } else {
            if (overlay) {
                overlay.classList.remove('show');
            }
        }
    } else {
        // 桌面端：折叠模式
        sidebar.classList.toggle('collapsed');
    }
}

// 打开项目管理模态框
function openProjectModal() {
    updateProjectManagementList();
}

// 更新项目管理列表
function updateProjectManagementList() {
    const container = document.getElementById('projectsManagementList');
    if (!container) return;

    if (projects.length === 0) {
        container.innerHTML = `
            <div class="text-center p-4 text-muted">
                <i class="bi bi-folder-x fs-1"></i>
                <h6>暂无项目</h6>
                <p>点击"新建项目"按钮创建您的第一个项目</p>
            </div>
        `;
        return;
    }

    container.innerHTML = projects.map(project => {
        const projectTasks = tasks.filter(task => task.projectId === project.id);
        const stats = {
            total: projectTasks.length,
            pending: projectTasks.filter(t => t.status === 'pending').length,
            inProgress: projectTasks.filter(t => t.status === 'in-progress').length,
            completed: projectTasks.filter(t => t.status === 'completed').length
        };

        return `
            <div class="project-management-item">
                <div class="project-management-color" style="background-color: ${project.color};"></div>
                <div class="project-management-info">
                    <div class="project-management-name">${escapeHtml(project.name)}</div>
                    <div class="project-management-description">${escapeHtml(project.description || '无描述')}</div>
                    <div class="project-management-stats">
                        <span class="project-stat">总计: ${stats.total}</span>
                        <span class="project-stat">待处理: ${stats.pending}</span>
                        <span class="project-stat">进行中: ${stats.inProgress}</span>
                        <span class="project-stat">已完成: ${stats.completed}</span>
                    </div>
                </div>
                <div class="project-management-actions">
                    <button class="btn btn-outline-primary btn-sm" onclick="editProject('${project.id}')" title="编辑">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm" onclick="deleteProject('${project.id}')" title="删除">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// 打开新建项目模态框
function openAddProjectModal() {
    currentEditingProjectId = null;
    document.getElementById('projectModalTitle').textContent = '新建项目';
    document.getElementById('projectForm').reset();
    document.getElementById('projectId').value = '';
    document.getElementById('projectColor').value = '#007bff';

    const modal = new bootstrap.Modal(document.getElementById('projectEditModal'));
    modal.show();
}

// 编辑项目
function editProject(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    currentEditingProjectId = projectId;
    document.getElementById('projectModalTitle').textContent = '编辑项目';
    document.getElementById('projectId').value = project.id;
    document.getElementById('projectName').value = project.name;
    document.getElementById('projectDescription').value = project.description || '';
    document.getElementById('projectColor').value = project.color;

    const modal = new bootstrap.Modal(document.getElementById('projectEditModal'));
    modal.show();
}

// 保存项目
async function saveProject() {
    const name = document.getElementById('projectName').value.trim();
    if (!name) {
        showError('请输入项目名称');
        return;
    }

    const projectData = {
        name,
        description: document.getElementById('projectDescription').value.trim(),
        color: document.getElementById('projectColor').value
    };

    try {
        let response;
        if (currentEditingProjectId) {
            // 更新项目
            response = await fetch(`/api/projects/${currentEditingProjectId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(projectData)
            });
        } else {
            // 创建新项目
            response = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(projectData)
            });
        }

        if (!response.ok) throw new Error('保存项目失败');

        const modal = bootstrap.Modal.getInstance(document.getElementById('projectEditModal'));
        modal.hide();

        // 重新加载项目数据
        await loadProjects();

        showSuccess(currentEditingProjectId ? '项目更新成功' : '项目创建成功');

    } catch (error) {
        console.error('保存项目失败:', error);
        showError('保存项目失败，请重试');
    }
}

// 删除项目
function deleteProject(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    projectToDelete = projectId;
    document.getElementById('projectDeleteName').textContent = project.name;

    const modal = new bootstrap.Modal(document.getElementById('projectDeleteModal'));
    modal.show();
}

// 确认删除项目
async function confirmDeleteProject() {
    if (!projectToDelete) return;

    try {
        const response = await fetch(`/api/projects/${projectToDelete}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '删除项目失败');
        }

        const modal = bootstrap.Modal.getInstance(document.getElementById('projectDeleteModal'));
        modal.hide();

        // 重新加载项目数据
        await loadProjects();

        // 如果删除的是当前选中的项目，切换到"全部项目"
        if (currentSelectedProjectId === projectToDelete) {
            selectProject('');
        }

        showSuccess('项目删除成功');

    } catch (error) {
        console.error('删除项目失败:', error);
        showError(error.message);
    } finally {
        projectToDelete = null;
    }
}

// ==================== Tab功能 ====================

// 激活指定的Tab
function activateTab(tabId) {
    // 移除所有Tab的active状态
    document.querySelectorAll('.nav-link').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('show', 'active');
    });

    // 激活指定的Tab
    const targetTab = document.getElementById(tabId);
    const targetPane = document.querySelector(targetTab.getAttribute('data-bs-target'));

    if (targetTab && targetPane) {
        targetTab.classList.add('active');
        targetPane.classList.add('show', 'active');
    }
}

// 更新Tab标签文本 - 全部项目模式
function updateTabLabelsForAllProjects() {
    const tasksTab = document.getElementById('tasks-tab');
    const flowchartTab = document.getElementById('flowchart-tab');
    const progressTab = document.getElementById('progress-tab');

    if (tasksTab) tasksTab.innerHTML = '<i class="bi bi-list-task me-2"></i>全部任务';
    if (flowchartTab) flowchartTab.innerHTML = '<i class="bi bi-diagram-3 me-2"></i>项目概览';
    if (progressTab) progressTab.innerHTML = '<i class="bi bi-graph-up me-2"></i>整体进度';
}

// 更新Tab标签文本 - 项目特定模式
function updateTabLabelsForProject() {
    const tasksTab = document.getElementById('tasks-tab');
    const flowchartTab = document.getElementById('flowchart-tab');
    const progressTab = document.getElementById('progress-tab');

    if (tasksTab) tasksTab.innerHTML = '<i class="bi bi-list-task me-2"></i>任务列表';
    if (flowchartTab) flowchartTab.innerHTML = '<i class="bi bi-diagram-3 me-2"></i>流程图';
    if (progressTab) progressTab.innerHTML = '<i class="bi bi-graph-up me-2"></i>项目进度';
}

// 更新流程图Tab
function updateFlowchartTab() {
    const container = document.getElementById('flowchartContainer');
    if (!container) return;

    if (currentSelectedProjectId === '') {
        // 全部项目模式 - 显示项目概览
        updateProjectOverview();
        return;
    }

    const project = projects.find(p => p.id === currentSelectedProjectId);
    if (!project) return;

    // 这里可以根据项目任务生成基本的流程图
    const projectTasks = tasks.filter(task => task.projectId === currentSelectedProjectId);

    if (projectTasks.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted p-5">
                <i class="bi bi-diagram-3 fs-1"></i>
                <h6 class="mt-3">项目流程图</h6>
                <p>该项目暂无任务，请先添加任务</p>
            </div>
        `;
        return;
    }

    // 简单的流程图展示
    let flowchartHTML = '<div class="p-3">';
    projectTasks.forEach((task, index) => {
        const statusColor = task.status === 'completed' ? '#28a745' :
                           task.status === 'in-progress' ? '#007bff' : '#ffc107';

        flowchartHTML += `
            <div class="flowchart-node" style="left: ${50 + (index % 3) * 200}px; top: ${50 + Math.floor(index / 3) * 100}px; border-color: ${statusColor};">
                <div class="fw-bold">${escapeHtml(task.title)}</div>
                <small class="text-muted">${getStatusText(task.status)}</small>
            </div>
        `;
    });
    flowchartHTML += '</div>';

    container.innerHTML = flowchartHTML;
}

// 更新项目概览（全部项目模式下的流程图Tab内容）
function updateProjectOverview() {
    const container = document.getElementById('flowchartContainer');
    if (!container) return;

    console.log('更新项目概览 - 项目数量:', projects.length, '任务数量:', tasks.length);

    if (projects.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted p-5">
                <i class="bi bi-folder-x fs-1"></i>
                <h6 class="mt-3">项目概览</h6>
                <p>暂无项目，请先创建项目</p>
            </div>
        `;
        return;
    }

    // 显示所有项目的概览卡片，包括无项目的任务
    let overviewHTML = '<div class="row p-3">';

    // 显示所有已创建的项目
    projects.forEach(project => {
        const projectTasks = tasks.filter(task => task.projectId === project.id);
        const total = projectTasks.length;
        const completed = projectTasks.filter(t => t.status === 'completed').length;
        const inProgress = projectTasks.filter(t => t.status === 'in-progress').length;
        const pending = projectTasks.filter(t => t.status === 'pending').length;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

        console.log(`项目 ${project.name}: 总任务=${total}, 已完成=${completed}, 进行中=${inProgress}, 待处理=${pending}`);

        overviewHTML += `
            <div class="col-md-4 mb-3">
                <div class="card h-100" style="border-left: 4px solid ${project.color};">
                    <div class="card-body">
                        <h6 class="card-title d-flex align-items-center">
                            <div class="project-color me-2" style="background-color: ${project.color};"></div>
                            ${escapeHtml(project.name)}
                        </h6>
                        <p class="card-text text-muted small">${escapeHtml(project.description || '无描述')}</p>

                        <div class="mb-2">
                            <div class="d-flex justify-content-between mb-1">
                                <small>进度</small>
                                <small>${progress}%</small>
                            </div>
                            <div class="progress" style="height: 6px;">
                                <div class="progress-bar" style="width: ${progress}%; background-color: ${project.color};"></div>
                            </div>
                        </div>

                        <div class="row text-center">
                            <div class="col-4">
                                <small class="text-warning">${pending}</small>
                                <div class="small text-muted">待处理</div>
                            </div>
                            <div class="col-4">
                                <small class="text-info">${inProgress}</small>
                                <div class="small text-muted">进行中</div>
                            </div>
                            <div class="col-4">
                                <small class="text-success">${completed}</small>
                                <div class="small text-muted">已完成</div>
                            </div>
                        </div>

                        <div class="mt-2">
                            <button class="btn btn-outline-primary btn-sm w-100" onclick="selectProject('${project.id}')">
                                查看详情
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    // 显示无项目归属的任务
    const unassignedTasks = tasks.filter(task => !task.projectId || task.projectId === '');
    if (unassignedTasks.length > 0) {
        const total = unassignedTasks.length;
        const completed = unassignedTasks.filter(t => t.status === 'completed').length;
        const inProgress = unassignedTasks.filter(t => t.status === 'in-progress').length;
        const pending = unassignedTasks.filter(t => t.status === 'pending').length;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

        console.log(`无项目任务: 总任务=${total}, 已完成=${completed}, 进行中=${inProgress}, 待处理=${pending}`);

        overviewHTML += `
            <div class="col-md-4 mb-3">
                <div class="card h-100" style="border-left: 4px solid #6c757d;">
                    <div class="card-body">
                        <h6 class="card-title d-flex align-items-center">
                            <div class="project-color me-2" style="background-color: #6c757d;"></div>
                            无项目任务
                        </h6>
                        <p class="card-text text-muted small">未分配到具体项目的任务</p>

                        <div class="mb-2">
                            <div class="d-flex justify-content-between mb-1">
                                <small>进度</small>
                                <small>${progress}%</small>
                            </div>
                            <div class="progress" style="height: 6px;">
                                <div class="progress-bar" style="width: ${progress}%; background-color: #6c757d;"></div>
                            </div>
                        </div>

                        <div class="row text-center">
                            <div class="col-4">
                                <small class="text-warning">${pending}</small>
                                <div class="small text-muted">待处理</div>
                            </div>
                            <div class="col-4">
                                <small class="text-info">${inProgress}</small>
                                <div class="small text-muted">进行中</div>
                            </div>
                            <div class="col-4">
                                <small class="text-success">${completed}</small>
                                <div class="small text-muted">已完成</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    overviewHTML += '</div>';

    // 添加整体统计
    const totalTasks = tasks.length;
    const totalProjects = projects.length;
    const totalCompleted = tasks.filter(t => t.status === 'completed').length;
    const overallProgress = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

    overviewHTML += `
        <div class="row p-3 mt-3">
            <div class="col-12">
                <div class="card bg-light">
                    <div class="card-body">
                        <h6 class="card-title">整体统计</h6>
                        <div class="row text-center">
                            <div class="col-3">
                                <h4 class="text-primary">${totalProjects}</h4>
                                <small class="text-muted">项目总数</small>
                            </div>
                            <div class="col-3">
                                <h4 class="text-info">${totalTasks}</h4>
                                <small class="text-muted">任务总数</small>
                            </div>
                            <div class="col-3">
                                <h4 class="text-success">${totalCompleted}</h4>
                                <small class="text-muted">已完成</small>
                            </div>
                            <div class="col-3">
                                <h4 class="text-warning">${overallProgress}%</h4>
                                <small class="text-muted">整体进度</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = overviewHTML;
}

// 更新进度Tab
function updateProgressTab() {
    if (currentSelectedProjectId === '') {
        // 全部项目模式 - 显示整体进度
        updateOverallProgress();
        return;
    }

    const project = projects.find(p => p.id === currentSelectedProjectId);
    if (!project) return;

    const projectTasks = tasks.filter(task => task.projectId === currentSelectedProjectId);

    // 更新进度统计
    const total = projectTasks.length;
    const pending = projectTasks.filter(t => t.status === 'pending').length;
    const inProgress = projectTasks.filter(t => t.status === 'in-progress').length;
    const completed = projectTasks.filter(t => t.status === 'completed').length;

    const progressPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    // 更新进度条和数字
    document.getElementById('overallProgress').textContent = `${progressPercentage}%`;
    document.getElementById('overallProgressBar').style.width = `${progressPercentage}%`;
    document.getElementById('progressPending').textContent = pending;
    document.getElementById('progressInProgress').textContent = inProgress;
    document.getElementById('progressCompleted').textContent = completed;

    // 更新时间线
    updateProjectTimeline(projectTasks);

    // 更新里程碑
    updateProjectMilestones(projectTasks);
}

// 更新整体进度（全部项目模式）
function updateOverallProgress() {
    console.log('更新整体进度 - 任务数量:', tasks.length);

    // 计算所有任务的统计
    const total = tasks.length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const inProgress = tasks.filter(t => t.status === 'in-progress').length;
    const completed = tasks.filter(t => t.status === 'completed').length;

    console.log(`整体统计: 总计=${total}, 待处理=${pending}, 进行中=${inProgress}, 已完成=${completed}`);

    const progressPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    // 更新进度条和数字
    const overallProgressElement = document.getElementById('overallProgress');
    const overallProgressBarElement = document.getElementById('overallProgressBar');
    const progressPendingElement = document.getElementById('progressPending');
    const progressInProgressElement = document.getElementById('progressInProgress');
    const progressCompletedElement = document.getElementById('progressCompleted');

    if (overallProgressElement) overallProgressElement.textContent = `${progressPercentage}%`;
    if (overallProgressBarElement) overallProgressBarElement.style.width = `${progressPercentage}%`;
    if (progressPendingElement) progressPendingElement.textContent = pending;
    if (progressInProgressElement) progressInProgressElement.textContent = inProgress;
    if (progressCompletedElement) progressCompletedElement.textContent = completed;

    // 更新时间线 - 显示所有任务
    updateProjectTimeline(tasks);

    // 更新里程碑 - 显示整体里程碑
    updateOverallMilestones();
}

// 更新项目时间线
function updateProjectTimeline(projectTasks) {
    const container = document.getElementById('projectTimeline');
    if (!container) return;

    console.log('更新时间线 - 任务数量:', projectTasks.length);

    if (projectTasks.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted p-3">
                <i class="bi bi-clock-history"></i>
                <p class="mb-0">暂无任务时间线</p>
            </div>
        `;
        return;
    }

    // 按创建时间排序，只显示最近的10个任务
    const sortedTasks = [...projectTasks]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10);

    let timelineHTML = '<div class="timeline">';
    sortedTasks.forEach(task => {
        const statusClass = task.status === 'completed' ? 'completed' :
                           task.status === 'in-progress' ? 'in-progress' : 'pending';

        // 获取项目信息
        const project = projects.find(p => p.id === task.projectId);
        const projectName = project ? project.name : '无项目';

        timelineHTML += `
            <div class="timeline-item ${statusClass}">
                <div class="fw-bold">${escapeHtml(task.title)}</div>
                <div class="text-muted small mb-1">${escapeHtml(projectName)}</div>
                <small class="text-muted">
                    ${new Date(task.createdAt).toLocaleDateString()} - ${getStatusText(task.status)}
                </small>
            </div>
        `;
    });

    if (projectTasks.length > 10) {
        timelineHTML += `
            <div class="timeline-item">
                <div class="text-muted small">
                    还有 ${projectTasks.length - 10} 个任务...
                </div>
            </div>
        `;
    }

    timelineHTML += '</div>';

    container.innerHTML = timelineHTML;
}

// 更新项目里程碑
function updateProjectMilestones(projectTasks) {
    const container = document.getElementById('milestonesContainer');
    if (!container) return;

    // 根据任务生成里程碑
    const milestones = [];

    // 项目开始
    if (projectTasks.length > 0) {
        const firstTask = projectTasks.reduce((earliest, task) =>
            new Date(task.createdAt) < new Date(earliest.createdAt) ? task : earliest
        );
        milestones.push({
            title: '项目启动',
            date: firstTask.createdAt,
            status: 'completed',
            description: '项目正式开始'
        });
    }

    // 高优先级任务完成
    const highPriorityCompleted = projectTasks.filter(t => t.priority === 'high' && t.status === 'completed');
    if (highPriorityCompleted.length > 0) {
        milestones.push({
            title: '关键任务完成',
            date: new Date().toISOString(),
            status: 'completed',
            description: `已完成 ${highPriorityCompleted.length} 个高优先级任务`
        });
    }

    // 项目完成度里程碑
    const completedCount = projectTasks.filter(t => t.status === 'completed').length;
    const totalCount = projectTasks.length;
    const completionRate = totalCount > 0 ? (completedCount / totalCount) : 0;

    if (completionRate >= 0.5) {
        milestones.push({
            title: '项目过半',
            date: new Date().toISOString(),
            status: completionRate >= 0.5 ? 'completed' : 'pending',
            description: `项目完成度已达到 ${Math.round(completionRate * 100)}%`
        });
    }

    if (completionRate === 1) {
        milestones.push({
            title: '项目完成',
            date: new Date().toISOString(),
            status: 'completed',
            description: '所有任务已完成'
        });
    }

    if (milestones.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted p-3">
                <i class="bi bi-flag"></i>
                <p class="mb-0">暂无里程碑</p>
            </div>
        `;
        return;
    }

    let milestonesHTML = '';
    milestones.forEach(milestone => {
        milestonesHTML += `
            <div class="milestone-item ${milestone.status}">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6 class="mb-1">${escapeHtml(milestone.title)}</h6>
                        <p class="mb-1">${escapeHtml(milestone.description)}</p>
                        <small class="text-muted">${new Date(milestone.date).toLocaleDateString()}</small>
                    </div>
                    <i class="bi bi-flag-fill"></i>
                </div>
            </div>
        `;
    });

    container.innerHTML = milestonesHTML;
}

// 更新整体里程碑（全部项目模式）
function updateOverallMilestones() {
    const container = document.getElementById('milestonesContainer');
    if (!container) return;

    const milestones = [];

    // 系统启动里程碑
    if (tasks.length > 0) {
        const firstTask = tasks.reduce((earliest, task) =>
            new Date(task.createdAt) < new Date(earliest.createdAt) ? task : earliest
        );
        milestones.push({
            title: '系统启动',
            date: firstTask.createdAt,
            status: 'completed',
            description: '任务管理系统开始使用'
        });
    }

    // 项目数量里程碑
    if (projects.length >= 3) {
        milestones.push({
            title: '项目扩展',
            date: new Date().toISOString(),
            status: 'completed',
            description: `已创建 ${projects.length} 个项目`
        });
    }

    // 任务完成里程碑
    const completedTasks = tasks.filter(t => t.status === 'completed');
    if (completedTasks.length >= 5) {
        milestones.push({
            title: '任务达成',
            date: new Date().toISOString(),
            status: 'completed',
            description: `已完成 ${completedTasks.length} 个任务`
        });
    }

    // 整体完成度里程碑
    const totalTasks = tasks.length;
    const completedCount = completedTasks.length;
    const completionRate = totalTasks > 0 ? (completedCount / totalTasks) : 0;

    if (completionRate >= 0.5) {
        milestones.push({
            title: '进度过半',
            date: new Date().toISOString(),
            status: 'completed',
            description: `整体完成度已达到 ${Math.round(completionRate * 100)}%`
        });
    }

    // 高效率里程碑
    const highPriorityCompleted = tasks.filter(t => t.priority === 'high' && t.status === 'completed');
    if (highPriorityCompleted.length >= 3) {
        milestones.push({
            title: '高效执行',
            date: new Date().toISOString(),
            status: 'completed',
            description: `已完成 ${highPriorityCompleted.length} 个高优先级任务`
        });
    }

    if (milestones.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted p-3">
                <i class="bi bi-flag"></i>
                <p class="mb-0">继续努力，即将达成第一个里程碑！</p>
            </div>
        `;
        return;
    }

    let milestonesHTML = '';
    milestones.forEach(milestone => {
        milestonesHTML += `
            <div class="milestone-item ${milestone.status}">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6 class="mb-1">${escapeHtml(milestone.title)}</h6>
                        <p class="mb-1">${escapeHtml(milestone.description)}</p>
                        <small class="text-muted">${new Date(milestone.date).toLocaleDateString()}</small>
                    </div>
                    <i class="bi bi-flag-fill"></i>
                </div>
            </div>
        `;
    });

    container.innerHTML = milestonesHTML;
}

// 流程图相关函数
function addFlowchartNode() {
    // 这里可以添加流程图节点的逻辑
    alert('流程图节点功能开发中...');
}

function resetFlowchart() {
    updateFlowchartTab();
}

function addMilestone() {
    // 这里可以添加里程碑的逻辑
    alert('添加里程碑功能开发中...');
}
