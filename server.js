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

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
