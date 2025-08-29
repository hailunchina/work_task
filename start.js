const path = require('path');
const fs = require('fs');

// 确保数据库目录存在
const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// 设置数据库路径环境变量
process.env.DB_PATH = path.join(dbDir, 'tasks.db');

// 启动主应用
require('./server.js');
