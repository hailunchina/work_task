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

    // 筛选并显示任务
    filterTasksByProject();
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
