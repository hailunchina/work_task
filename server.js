const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const TaskDB = require('./database');
const config = require('./config');

const app = express();
const PORT = config.server.port;

// 中间件
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// 路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 获取安全配置（不包含密码）
app.get('/api/config', (req, res) => {
  res.json({
    security: {
      enabled: config.security.enabled,
      sessionDuration: config.security.sessionDuration
    },
    app: config.app
  });
});

// 验证密码
app.post('/api/auth', (req, res) => {
  const { password } = req.body;

  if (!config.security.enabled) {
    return res.json({ success: true, message: '密码保护已禁用' });
  }

  if (password === config.security.password) {
    res.json({ success: true, message: '密码验证成功' });
  } else {
    res.status(401).json({ success: false, message: '密码错误' });
  }
});

// 获取所有任务
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await TaskDB.getAllTasks();
    res.json(tasks);
  } catch (error) {
    console.error('获取任务失败:', error);
    res.status(500).json({ error: '获取任务失败' });
  }
});

// 创建新任务
app.post('/api/tasks', async (req, res) => {
  const { title, description, priority, dueDate, projectId } = req.body;

  if (!title) {
    return res.status(400).json({ error: '任务标题不能为空' });
  }

  const newTask = {
    id: uuidv4(),
    title,
    description: description || '',
    priority: priority || 'medium',
    status: 'pending',
    dueDate: dueDate || '',
    projectId: projectId || null,
    createdAt: new Date().toISOString()
  };

  try {
    const createdTask = await TaskDB.createTask(newTask);
    res.status(201).json(createdTask);
  } catch (error) {
    console.error('创建任务失败:', error);
    res.status(500).json({ error: '创建任务失败' });
  }
});

// 更新任务
app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, priority, status, dueDate, projectId } = req.body;

  try {
    // 先获取现有任务
    const existingTask = await TaskDB.getTaskById(id);
    if (!existingTask) {
      return res.status(404).json({ error: '任务未找到' });
    }

    // 准备更新数据
    const updates = {
      title: title || existingTask.title,
      description: description !== undefined ? description : existingTask.description,
      priority: priority || existingTask.priority,
      status: status || existingTask.status,
      dueDate: dueDate !== undefined ? dueDate : existingTask.dueDate,
      projectId: projectId !== undefined ? projectId : existingTask.projectId,
      updatedAt: new Date().toISOString()
    };

    await TaskDB.updateTask(id, updates);

    // 返回更新后的任务
    const updatedTask = await TaskDB.getTaskById(id);
    res.json(updatedTask);
  } catch (error) {
    console.error('更新任务失败:', error);
    if (error.message === '任务未找到') {
      res.status(404).json({ error: '任务未找到' });
    } else {
      res.status(500).json({ error: '更新任务失败' });
    }
  }
});

// 删除任务
app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await TaskDB.deleteTask(id);
    res.status(204).send();
  } catch (error) {
    console.error('删除任务失败:', error);
    if (error.message === '任务未找到') {
      res.status(404).json({ error: '任务未找到' });
    } else {
      res.status(500).json({ error: '删除任务失败' });
    }
  }
});

// WebHook推送任务
app.post('/api/tasks/:id/webhook', async (req, res) => {
  const { id } = req.params;
  const { webhookUrl } = req.body;

  if (!webhookUrl) {
    return res.status(400).json({ error: 'WebHook URL不能为空' });
  }

  try {
    // 获取任务信息
    const task = await TaskDB.getTaskById(id);
    if (!task) {
      return res.status(404).json({ error: '任务未找到' });
    }

    // 构建Markdown内容
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

    const markdownContent = `## 📋 任务推送通知

**任务标题：** ${task.title}

**任务描述：** ${task.description || '无'}

**任务状态：** ${statusMap[task.status] || task.status}

**优先级：** ${priorityMap[task.priority] || task.priority}

**截止日期：** ${task.dueDate || '未设置'}

**创建时间：** ${new Date(task.createdAt).toLocaleString('zh-CN')}

${task.updatedAt ? `**更新时间：** ${new Date(task.updatedAt).toLocaleString('zh-CN')}` : ''}

---
*来自工作任务计划表系统*`;

    // 构建WebHook JSON
    const webhookData = {
      "msgtype": "markdown",
      "markdown": {
        "content": markdownContent
      }
    };

    // 发送WebHook请求
    const fetch = require('node-fetch');
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookData)
    });

    if (response.ok) {
      res.json({ success: true, message: '任务推送成功' });
    } else {
      throw new Error(`WebHook请求失败: ${response.status}`);
    }

  } catch (error) {
    console.error('WebHook推送失败:', error);
    res.status(500).json({ error: 'WebHook推送失败: ' + error.message });
  }
});

// 项目管理API
// 获取所有项目
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await TaskDB.getAllProjects();
    res.json(projects);
  } catch (error) {
    console.error('获取项目失败:', error);
    res.status(500).json({ error: '获取项目失败' });
  }
});

// 根据ID获取项目
app.get('/api/projects/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const project = await TaskDB.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: '项目未找到' });
    }
    res.json(project);
  } catch (error) {
    console.error('获取项目失败:', error);
    res.status(500).json({ error: '获取项目失败' });
  }
});

// 创建新项目
app.post('/api/projects', async (req, res) => {
  const { name, description, color } = req.body;

  if (!name) {
    return res.status(400).json({ error: '项目名称不能为空' });
  }

  const newProject = {
    id: uuidv4(),
    name,
    description: description || '',
    color: color || '#007bff',
    createdAt: new Date().toISOString()
  };

  try {
    const createdProject = await TaskDB.createProject(newProject);
    res.status(201).json(createdProject);
  } catch (error) {
    console.error('创建项目失败:', error);
    res.status(500).json({ error: '创建项目失败' });
  }
});

// 更新项目
app.put('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, color } = req.body;

  try {
    // 先获取现有项目
    const existingProject = await TaskDB.getProjectById(id);
    if (!existingProject) {
      return res.status(404).json({ error: '项目未找到' });
    }

    // 准备更新数据
    const updates = {
      name: name || existingProject.name,
      description: description !== undefined ? description : existingProject.description,
      color: color || existingProject.color,
      updatedAt: new Date().toISOString()
    };

    await TaskDB.updateProject(id, updates);

    // 返回更新后的项目
    const updatedProject = await TaskDB.getProjectById(id);
    res.json(updatedProject);
  } catch (error) {
    console.error('更新项目失败:', error);
    if (error.message === '项目未找到') {
      res.status(404).json({ error: '项目未找到' });
    } else {
      res.status(500).json({ error: '更新项目失败' });
    }
  }
});

// 删除项目
app.delete('/api/projects/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await TaskDB.deleteProject(id);
    res.json({ message: '项目删除成功' });
  } catch (error) {
    console.error('删除项目失败:', error);
    if (error.message === '项目未找到') {
      res.status(404).json({ error: '项目未找到' });
    } else if (error.message.includes('该项目下还有任务')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: '删除项目失败' });
    }
  }
});

// 获取项目任务统计
app.get('/api/projects/:id/stats', async (req, res) => {
  const { id } = req.params;

  try {
    const stats = await TaskDB.getProjectTaskStats(id);
    res.json(stats);
  } catch (error) {
    console.error('获取项目统计失败:', error);
    res.status(500).json({ error: '获取项目统计失败' });
  }
});

// 更新项目说明
app.put('/api/projects/:id/description', async (req, res) => {
  const { id } = req.params;
  const { markdownDescription } = req.body;

  try {
    await TaskDB.updateProjectDescription(id, markdownDescription);
    res.json({ message: '项目说明更新成功' });
  } catch (error) {
    console.error('更新项目说明失败:', error);
    if (error.message === '项目未找到') {
      res.status(404).json({ error: '项目未找到' });
    } else {
      res.status(500).json({ error: '更新项目说明失败' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
