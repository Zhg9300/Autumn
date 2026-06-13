# 部署和同步配置

## 1. 创建 Supabase 项目

1. 在 Supabase 创建项目。
2. 打开 SQL Editor，执行数据库初始化 SQL：
   - 不要在 SQL Editor 里输入 `supabase-schema.sql` 这个文件名。
   - 打开本项目里的 `supabase-schema.sql` 文件。
   - 复制文件里的全部 SQL 内容。
   - 粘贴到 Supabase SQL Editor 后点击 Run。
3. 在 Authentication 中启用 Email + Password 登录。
4. 如果开启邮箱确认，把 GitHub Pages 地址加入 Auth URL 配置：
   - 进入 Supabase Dashboard。
   - 打开 Authentication -> URL Configuration。
   - `Site URL` 填你的 GitHub Pages 首页地址，例如 `https://你的用户名.github.io/仓库名/`。
   - `Redirect URLs` 增加同一个地址，例如 `https://你的用户名.github.io/仓库名/`。
   - 如果你的页面未来可能有子路径，也可以再增加 `https://你的用户名.github.io/仓库名/**`。
   - 保存配置。

## 2. 配置前端

编辑 `supabase-config.js`：

```js
window.PREP_SUPABASE_CONFIG = {
  url: "https://你的项目.supabase.co",
  anonKey: "你的 anon/public key"
};
```

只能填写 anon/public key。不要把 service_role key、数据库密码或任何私密密钥放进前端文件。

## 3. GitHub Pages

需要发布的文件：

- `index.html`
- `styles.css`
- `app.js`
- `supabase-config.js`
- `assets/`
- `.nojekyll`

不要发布本地 `.txt` 源笔记。当前 `.gitignore` 已包含 `*.txt`，如果仓库已经跟踪过这些文件，需要先从 Git 索引中移除。

## 4. 首次同步

1. 打开线上页面。
2. 注册或登录账号。
3. 如果当前浏览器有旧版本地数据，页面会显示“上传本机数据到云端”。
4. 上传完成后，另一台电脑登录同一账号即可看到相同笔记。
