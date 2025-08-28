const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const TaskDB = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// 路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
  const { title, description, priority, dueDate } = req.body;

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
  const { title, description, priority, status, dueDate } = req.body;

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

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
