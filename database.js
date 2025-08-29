const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 数据库文件路径 - 使用环境变量或当前工作目录
const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'tasks.db');

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
    // 创建项目表
    const createProjectsTableSQL = `
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            markdown_description TEXT,
            color TEXT DEFAULT '#007bff',
            created_at TEXT NOT NULL,
            updated_at TEXT
        )
    `;

    // 创建任务表（添加project_id字段）
    const createTasksTableSQL = `
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT DEFAULT 'medium',
            status TEXT DEFAULT 'pending',
            due_date TEXT,
            project_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            FOREIGN KEY (project_id) REFERENCES projects (id)
        )
    `;

    // 先创建项目表
    db.run(createProjectsTableSQL, (err) => {
        if (err) {
            console.error('创建项目表失败:', err.message);
        } else {
            console.log('项目表已初始化');

            // 再创建任务表
            db.run(createTasksTableSQL, (err) => {
                if (err) {
                    console.error('创建任务表失败:', err.message);
                } else {
                    console.log('任务表已初始化');
                    insertSampleData();
                }
            });
        }
    });
}

// 插入示例数据（仅在表为空时）
function insertSampleData() {
    // 先检查并插入示例项目数据
    db.get("SELECT COUNT(*) as count FROM projects", (err, row) => {
        if (err) {
            console.error('查询项目数量失败:', err.message);
            return;
        }

        if (row.count === 0) {
            console.log('插入示例项目数据...');
            const sampleProjects = [
                {
                    id: 'project-1',
                    name: '网站开发',
                    description: '公司官网开发项目',
                    color: '#007bff',
                    created_at: new Date().toISOString()
                },
                {
                    id: 'project-2',
                    name: '移动应用',
                    description: '移动端APP开发',
                    color: '#28a745',
                    created_at: new Date().toISOString()
                },
                {
                    id: 'project-3',
                    name: '数据分析',
                    description: '用户行为数据分析系统',
                    color: '#ffc107',
                    created_at: new Date().toISOString()
                }
            ];

            const insertProjectSQL = `INSERT INTO projects (id, name, description, color, created_at)
                                     VALUES (?, ?, ?, ?, ?)`;

            sampleProjects.forEach(project => {
                db.run(insertProjectSQL, [
                    project.id, project.name, project.description,
                    project.color, project.created_at
                ], (err) => {
                    if (err) {
                        console.error('插入示例项目失败:', err.message);
                    }
                });
            });

            console.log('示例项目数据插入完成');
        }

        // 然后检查并插入示例任务数据
        insertSampleTasks();
    });
}

function insertSampleTasks() {
    db.get("SELECT COUNT(*) as count FROM tasks", (err, row) => {
        if (err) {
            console.error('查询任务数量失败:', err.message);
            return;
        }

        if (row.count === 0) {
            console.log('插入示例任务数据...');
            const sampleTasks = [
                {
                    id: 'task-1',
                    title: '完成项目文档',
                    description: '编写项目的技术文档和用户手册',
                    priority: 'high',
                    status: 'pending',
                    due_date: '2024-01-15',
                    project_id: 'project-1',
                    created_at: new Date().toISOString()
                },
                {
                    id: 'task-2',
                    title: '代码审查',
                    description: '对新功能代码进行审查和测试',
                    priority: 'medium',
                    status: 'in-progress',
                    due_date: '2024-01-10',
                    project_id: 'project-1',
                    created_at: new Date().toISOString()
                },
                {
                    id: 'task-3',
                    title: '部署到生产环境',
                    description: '将应用部署到生产服务器',
                    priority: 'high',
                    status: 'completed',
                    due_date: '2024-01-05',
                    project_id: 'project-2',
                    created_at: new Date().toISOString()
                }
            ];

            const insertSQL = `INSERT INTO tasks (id, title, description, priority, status, due_date, project_id, created_at)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

            sampleTasks.forEach(task => {
                db.run(insertSQL, [
                    task.id, task.title, task.description,
                    task.priority, task.status, task.due_date, task.project_id, task.created_at
                ], (err) => {
                    if (err) {
                        console.error('插入示例任务失败:', err.message);
                    }
                });
            });

            console.log('示例任务数据插入完成');
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
                        projectId: row.project_id,
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
                        projectId: row.project_id,
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
                INSERT INTO tasks (id, title, description, priority, status, due_date, project_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.run(sql, [
                task.id,
                task.title,
                task.description,
                task.priority,
                task.status,
                task.dueDate,
                task.projectId,
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
                SET title = ?, description = ?, priority = ?, status = ?, due_date = ?, project_id = ?, updated_at = ?
                WHERE id = ?
            `;

            db.run(sql, [
                updates.title,
                updates.description,
                updates.priority,
                updates.status,
                updates.dueDate,
                updates.projectId,
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
    },

    // 项目管理方法
    // 获取所有项目
    getAllProjects: () => {
        return new Promise((resolve, reject) => {
            const sql = "SELECT * FROM projects ORDER BY created_at DESC";
            db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const projects = rows.map(row => ({
                        id: row.id,
                        name: row.name,
                        description: row.description,
                        markdownDescription: row.markdown_description,
                        color: row.color,
                        createdAt: row.created_at,
                        updatedAt: row.updated_at
                    }));
                    resolve(projects);
                }
            });
        });
    },

    // 根据ID获取项目
    getProjectById: (id) => {
        return new Promise((resolve, reject) => {
            const sql = "SELECT * FROM projects WHERE id = ?";
            db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else if (row) {
                    const project = {
                        id: row.id,
                        name: row.name,
                        description: row.description,
                        markdownDescription: row.markdown_description,
                        color: row.color,
                        createdAt: row.created_at,
                        updatedAt: row.updated_at
                    };
                    resolve(project);
                } else {
                    resolve(null);
                }
            });
        });
    },

    // 创建新项目
    createProject: (project) => {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO projects (id, name, description, markdown_description, color, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            db.run(sql, [
                project.id,
                project.name,
                project.description,
                project.markdownDescription || '',
                project.color,
                project.createdAt
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(project);
                }
            });
        });
    },

    // 更新项目
    updateProject: (id, updates) => {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE projects
                SET name = ?, description = ?, markdown_description = ?, color = ?, updated_at = ?
                WHERE id = ?
            `;

            db.run(sql, [
                updates.name,
                updates.description,
                updates.markdownDescription,
                updates.color,
                updates.updatedAt,
                id
            ], function(err) {
                if (err) {
                    reject(err);
                } else if (this.changes === 0) {
                    reject(new Error('项目未找到'));
                } else {
                    resolve();
                }
            });
        });
    },

    // 删除项目
    deleteProject: (id) => {
        return new Promise((resolve, reject) => {
            // 先检查是否有关联的任务
            const checkTasksSQL = "SELECT COUNT(*) as count FROM tasks WHERE project_id = ?";
            db.get(checkTasksSQL, [id], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (row.count > 0) {
                    reject(new Error('无法删除项目：该项目下还有任务'));
                    return;
                }

                // 如果没有关联任务，则删除项目
                const deleteSQL = "DELETE FROM projects WHERE id = ?";
                db.run(deleteSQL, [id], function(err) {
                    if (err) {
                        reject(err);
                    } else if (this.changes === 0) {
                        reject(new Error('项目未找到'));
                    } else {
                        resolve();
                    }
                });
            });
        });
    },

    // 更新项目说明
    updateProjectDescription: (id, markdownDescription) => {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE projects
                SET markdown_description = ?, updated_at = ?
                WHERE id = ?
            `;

            db.run(sql, [
                markdownDescription,
                new Date().toISOString(),
                id
            ], function(err) {
                if (err) {
                    reject(err);
                } else if (this.changes === 0) {
                    reject(new Error('项目未找到'));
                } else {
                    resolve();
                }
            });
        });
    },

    // 获取项目的任务统计
    getProjectTaskStats: (projectId) => {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT
                    status,
                    COUNT(*) as count
                FROM tasks
                WHERE project_id = ?
                GROUP BY status
            `;

            db.all(sql, [projectId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const stats = {
                        total: 0,
                        pending: 0,
                        'in-progress': 0,
                        completed: 0
                    };

                    rows.forEach(row => {
                        stats[row.status] = row.count;
                        stats.total += row.count;
                    });

                    resolve(stats);
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
