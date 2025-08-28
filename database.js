const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 数据库文件路径
const dbPath = path.join(__dirname, 'tasks.db');

// 创建数据库连接
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('连接数据库失败:', err.message);
    } else {
        console.log('已连接到SQLite数据库');
        initializeDatabase();
    }
});

// 初始化数据库表
function initializeDatabase() {
    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT DEFAULT 'medium',
            status TEXT DEFAULT 'pending',
            due_date TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT
        )
    `;
    
    db.run(createTableSQL, (err) => {
        if (err) {
            console.error('创建表失败:', err.message);
        } else {
            console.log('数据库表已初始化');
            insertSampleData();
        }
    });
}

// 插入示例数据（仅在表为空时）
function insertSampleData() {
    db.get("SELECT COUNT(*) as count FROM tasks", (err, row) => {
        if (err) {
            console.error('查询任务数量失败:', err.message);
            return;
        }
        
        if (row.count === 0) {
            const { v4: uuidv4 } = require('uuid');
            const sampleTask = {
                id: uuidv4(),
                title: '示例任务',
                description: '这是一个示例任务，展示应用功能',
                priority: 'medium',
                status: 'pending',
                due_date: '2024-01-15',
                created_at: new Date().toISOString()
            };
            
            const insertSQL = `
                INSERT INTO tasks (id, title, description, priority, status, due_date, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            db.run(insertSQL, [
                sampleTask.id,
                sampleTask.title,
                sampleTask.description,
                sampleTask.priority,
                sampleTask.status,
                sampleTask.due_date,
                sampleTask.created_at
            ], (err) => {
                if (err) {
                    console.error('插入示例数据失败:', err.message);
                } else {
                    console.log('示例数据已插入');
                }
            });
        }
    });
}

// 数据库操作方法
const TaskDB = {
    // 获取所有任务
    getAllTasks: () => {
        return new Promise((resolve, reject) => {
            const sql = "SELECT * FROM tasks ORDER BY created_at DESC";
            db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // 转换字段名以匹配前端期望的格式
                    const tasks = rows.map(row => ({
                        id: row.id,
                        title: row.title,
                        description: row.description,
                        priority: row.priority,
                        status: row.status,
                        dueDate: row.due_date,
                        createdAt: row.created_at,
                        updatedAt: row.updated_at
                    }));
                    resolve(tasks);
                }
            });
        });
    },

    // 根据ID获取任务
    getTaskById: (id) => {
        return new Promise((resolve, reject) => {
            const sql = "SELECT * FROM tasks WHERE id = ?";
            db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else if (row) {
                    const task = {
                        id: row.id,
                        title: row.title,
                        description: row.description,
                        priority: row.priority,
                        status: row.status,
                        dueDate: row.due_date,
                        createdAt: row.created_at,
                        updatedAt: row.updated_at
                    };
                    resolve(task);
                } else {
                    resolve(null);
                }
            });
        });
    },

    // 创建新任务
    createTask: (task) => {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO tasks (id, title, description, priority, status, due_date, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            db.run(sql, [
                task.id,
                task.title,
                task.description,
                task.priority,
                task.status,
                task.dueDate,
                task.createdAt
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(task);
                }
            });
        });
    },

    // 更新任务
    updateTask: (id, updates) => {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE tasks 
                SET title = ?, description = ?, priority = ?, status = ?, due_date = ?, updated_at = ?
                WHERE id = ?
            `;
            
            db.run(sql, [
                updates.title,
                updates.description,
                updates.priority,
                updates.status,
                updates.dueDate,
                updates.updatedAt,
                id
            ], function(err) {
                if (err) {
                    reject(err);
                } else if (this.changes === 0) {
                    reject(new Error('任务未找到'));
                } else {
                    resolve();
                }
            });
        });
    },

    // 删除任务
    deleteTask: (id) => {
        return new Promise((resolve, reject) => {
            const sql = "DELETE FROM tasks WHERE id = ?";
            db.run(sql, [id], function(err) {
                if (err) {
                    reject(err);
                } else if (this.changes === 0) {
                    reject(new Error('任务未找到'));
                } else {
                    resolve();
                }
            });
        });
    }
};

// 优雅关闭数据库连接
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('关闭数据库连接失败:', err.message);
        } else {
            console.log('数据库连接已关闭');
        }
        process.exit(0);
    });
});

module.exports = TaskDB;
