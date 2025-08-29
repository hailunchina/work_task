// 工作任务计划表 - 配置文件
// ================================

module.exports = {
    // 服务器配置
    server: {
        port: process.env.PORT || 8765,
        host: 'localhost'
    },
    
    // 密码保护配置
    security: {
        // 访问密码 - 请修改为您自己的密码
        password: 'admin123',
        
        // 会话有效期（小时）
        sessionDuration: 24,
        
        // 是否启用密码保护
        enabled: true
    },
    
    // 数据库配置
    database: {
        // 数据库文件路径
        path: process.env.DB_PATH || 'data/tasks.db',
        
        // 是否启用示例数据
        enableSampleData: true
    },
    
    // 应用配置
    app: {
        // 应用名称
        name: '工作任务计划表',
        
        // 版本号
        version: '1.0.0',
        
        // 默认语言
        language: 'zh-CN'
    }
};

// 配置说明：
// 
// 1. 修改密码：
//    将 security.password 的值改为您想要的密码
//    例如：password: 'mySecretPassword123'
//
// 2. 禁用密码保护：
//    将 security.enabled 设置为 false
//
// 3. 修改会话时长：
//    将 security.sessionDuration 设置为您想要的小时数
//    例如：sessionDuration: 8 (8小时后需要重新登录)
//
// 4. 修改端口：
//    将 server.port 设置为您想要的端口号
//    例如：port: 3000
//
// 注意：修改配置后需要重启应用才能生效
