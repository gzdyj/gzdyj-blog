---
title: "Deploying Mx Space + Shiro with Nginx Proxy Manager Reverse Proxy"
published: 2025-05-01
description: "A complete tutorial on deploying Mx Space frontend and backend using Nginx Proxy Manager reverse proxy, covering the core backend and the Shiro theme."
tags: [MxSpace, Shiro, Nginx, Deployment, ReverseProxy]
category: Tutorial
lang: "en"
---

# Deploying Mx Space + Shiro with Nginx Proxy Manager Reverse Proxy

## Introduction

Mix Space is a simple yet powerful personal blog system — fast, modern, and clean. You can use it to build your own personal space, record your life, and share knowledge.

[Mix Space Official Docs](https://mx-space.js.org/)

This tutorial uses Nginx Proxy Manager to reverse-proxy both frontend and backend.

- Frontend domain: `zinzin.top`
- Backend domain: `mx.zinzin.top`

## Prerequisites

You'll need the following:

- A server (Linux kernel version > 4.18, RAM > 1GiB; this tutorial uses Debian 11)
- A domain name mapped to your server's IP
- Docker installed

---

## Install Nginx Proxy Manager

1. Create a `docker-compose.yml` file in any directory:

   ```yaml
   services:
     app:
       image: 'jc21/nginx-proxy-manager:latest'
       restart: unless-stopped
       ports:
         - '80:80'
         - '81:81'
         - '443:443'
       volumes:
         - ./data:/data
         - ./letsencrypt:/etc/letsencrypt
   ```

2. Save the file and start the service:

   ```bash
   docker-compose up -d

   # Or
   docker compose up -d
   ```

3. If you're a first-time user, refer to these guides:

   - [A recommended nginx management tool: Nginx Proxy Manager](https://blog.zinzin.cc/archives/tui-jian-yi-ge-nginxguan-li-gong-ju-nginx-proxy-manager)
   - [Official guide](https://nginxproxymanager.com/guide/)

---

## Deploy the Backend

1. Pull the configuration file:

   ```bash
   cd && mkdir -p mx-space/core && cd $_

   # Download docker-compose.yml
   wget https://fastly.jsdelivr.net/gh/mx-space/core@master/docker-compose.yml
   ```

2. Edit the `environment` fields in `docker-compose.yml`:

   - **JWT_SECRET**: A string of 16 to 32 characters used to encrypt user JWTs.
   - **ALLOWED_ORIGINS**: Usually the frontend domain; separate multiple domains with commas.
   - **ENCRYPT_ENABLE**: Change `false` to `true` if encryption is needed, and fill in the encryption key.
   - **ENCRYPT_KEY**: Must be 64 characters long.

3. Here's an example configuration — set the JWT secret and allowed domains according to your own setup:

   ```yaml
   services:
     app:
       container_name: mx-server
       image: innei/mx-server:latest
       environment:
         - TZ=Asia/Shanghai
         - NODE_ENV=production
         - DB_HOST=mongo
         - REDIS_HOST=redis
         - ALLOWED_ORIGINS=zinzin.top
         - JWT_SECRET=Yy14003252791400325279
       volumes:
         - ./data/mx-space:/root/.mx-space
       ports:
         - '2333:2333'
       depends_on:
         - mongo
         - redis
       networks:
         - mx-space
       restart: unless-stopped
       healthcheck:
         test: ['CMD', 'curl', '-f', 'http://127.0.0.1:2333/api/v2/ping']
         interval: 1m30s
         timeout: 30s
         retries: 5
         start_period: 30s

     mongo:
       container_name: mongo
       image: mongo
       volumes:
         - ./data/db:/data/db
       networks:
         - mx-space
       restart: unless-stopped

     redis:
       image: redis:alpine
       container_name: redis
       volumes:
         - ./data/redis:/data
       healthcheck:
         test: ['CMD-SHELL', 'redis-cli ping | grep PONG']
         start_period: 20s
         interval: 30s
         retries: 5
         timeout: 3s
       networks:
         - mx-space
       restart: unless-stopped

   networks:
     mx-space:
       driver: bridge
   ```

4. Start the backend service:

   ```bash
   docker-compose up -d

   # Or
   docker compose up -d
   ```

5. Once done, you'll see a screen like this:

   ![core setup complete](https://yp.zinzin.cc//blog/20250225232113.png)

---

## Reverse Proxy the Mx Space Backend with Nginx Proxy Manager

1. Open the Nginx Proxy Manager admin panel and follow these steps:

   ![nginx step 1](https://yp.zinzin.cc//blog/20250301130133.png)

   ![nginx step 2](https://yp.zinzin.cc//blog/image-20250301130824412.png)

   > **Note**: On servers in mainland China, automatic certificate issuance may fail due to network issues. Try a few times, or upload a certificate manually.

2. After it succeeds, visit `https://mx.zinzin.top/proxy/qaqdmin` for initial setup:

   ![initial backend setup page](https://yp.zinzin.cc//blog/image-20250301131012065.png)

3. The admin panel after successful deployment:

   ![backend admin panel](https://yp.zinzin.cc//blog/image-20250301131533408.png)

---

## Deploy the Shiro Frontend

### 1. Configure the Theme

1. In the admin panel, go to "Extras – Config & Cloud Functions" and fill in the following:

   - **Name**: `shiro`
   - **Reference**: `theme`
   - **Data type**: `JSON`
   - **Data**: See the JSON config below.

   json

   ```json
   {
     "footer": {
       "otherInfo": {
         "date": "2020-{{now}}",
         "icp": {
           "text": "萌 ICP 备 20236136 号",
           "link": "https://icp.gov.moe/?keyword=20236136"
         }
       },
       "linkSections": [
         {
           "name": "About",
           "links": [
             {
               "name": "About this site",
               "href": "/about-site"
             },
             {
               "name": "About me",
               "href": "/about"
             },
             {
               "name": "About this project",
               "href": "https://github.com/innei/Shiro",
               "external": true
             }
           ]
         },
         {
           "name": "More",
           "links": [
             {
               "name": "Timeline",
               "href": "/timeline"
             },
             {
               "name": "Friends",
               "href": "/friends"
             },
             {
               "name": "Monitor",
               "href": "https://status.innei.in/status/main",
               "external": true
             }
           ]
         },
         {
           "name": "Contact",
           "links": [
             {
               "name": "Leave a message",
               "href": "/message"
             },
             {
               "name": "Send email",
               "href": "mailto:i@innei.ren",
               "external": true
             },
             {
               "name": "GitHub",
               "href": "https://github.com/innei",
               "external": true
             }
           ]
         }
       ]
     },
     "config": {
       "color": {
         "light": [
           "#33A6B8",
           "#FF6666",
           "#26A69A",
           "#fb7287",
           "#69a6cc",
           "#F11A7B",
           "#78C1F3",
           "#FF6666",
           "#7ACDF6"
         ],
         "dark": [
           "#F596AA",
           "#A0A7D4",
           "#ff7b7b",
           "#99D8CF",
           "#838BC6",
           "#FFE5AD",
           "#9BE8D8",
           "#A1CCD1",
           "#EAAEBA"
         ]
       },

       "bg": [
         "https://github.com/Innei/static/blob/master/images/F0q8mwwaIAEtird.jpeg?raw=true",
         "https://github.com/Innei/static/blob/master/images/IMG_2111.jpeg.webp.jpg?raw=true"
       ],
       "custom": {
         "css": [],
         "styles": [],
         "js": [],
         "scripts": []
       },
       "site": {
         "favicon": "/innei.svg",
         "faviconDark": "/innei-dark.svg"
       },
       "hero": {
         "title": {
           "template": [
             {
               "type": "h1",
               "text": "Hi, I'm ",
               "class": "font-light text-4xl"
             },
             {
               "type": "h1",
               "text": "Innei",
               "class": "font-medium mx-2 text-4xl"
             },
             {
               "type": "h1",
               "text": "👋。",
               "class": "font-light text-4xl"
             },
             {
               "type": "br"
             },
             {
               "type": "h1",
               "text": "A NodeJS Full Stack ",
               "class": "font-light text-4xl"
             },
             {
               "type": "code",
               "text": "<Developer />",
               "class": "font-medium mx-2 text-3xl rounded p-1 bg-gray-200 dark:bg-gray-800/0 hover:dark:bg-gray-800/100 bg-opacity-0 hover:bg-opacity-100 transition-background duration-200"
             },
             {
               "type": "span",
               "class": "inline-block w-[1px] h-8 -bottom-2 relative bg-gray-800/80 dark:bg-gray-200/80 opacity-0 group-hover:opacity-100 transition-opacity duration-200 group-hover:animation-blink"
             }
           ]
         },
         "description": "An independent developer coding with love."
       },
       "module": {
         "activity": {
           "enable": true,
           "endpoint": "/fn/ps/update"
         },
         "donate": {
           "enable": true,
           "link": "https://afdian.net/@Innei",
           "qrcode": [
             "https://cdn.jsdelivr.net/gh/Innei/img-bed@master/20191211132347.png",
             "https://cdn.innei.ren/bed/2023/0424213144.png"
           ]
         },
         "bilibili": {
           "liveId": 1434499
         }
       }
     }
   }
   ```

   ![theme configuration](https://yp.zinzin.cc//blog/image-20250301132618667.png)

   > **Tip**: For detailed configuration, refer to the official docs: [Config Options](https://mx-space.js.org/docs/themes/shiro/config).

---

### 2. Deploy Shiro with Docker Compose

1. Create and enter the `shiro` directory:

   ```bash
   mkdir shiro
   cd shiro
   ```

2. Download the required files:

   ```bash
   wget https://raw.githubusercontent.com/Innei/Shiro/main/docker-compose.yml
   wget https://raw.githubusercontent.com/Innei/Shiro/main/.env.template
   mv .env.template .env
   ```

3. Update the backend URL in the `.env` file:

   ```bash
   vim .env # Edit your ENV variables
   ```

   ![set the backend URL in env](https://yp.zinzin.cc//blog/image-20250301142658945.png)

   After saving, start the service:

   ```bash
   docker compose up -d

   # Or
   docker-compose up -d
   ```

4. To update the image later:

   ```bash
   docker compose pull
   ```

---

### 3. Reverse Proxy Shiro with Nginx Proxy Manager

![Shiro reverse proxy 1](https://yp.zinzin.cc//blog/image-20250301155851489.png)

![Shiro reverse proxy 2](https://yp.zinzin.cc//blog/image-20250301160044646.png)

Follow the prompts to configure the reverse proxy. If all services run on the same machine, you can use internal IP addresses directly.

---

## Access the Main Site

Once everything is deployed, visit `https://zinzin.top` to see the main site:

![main site](https://yp.zinzin.cc//blog/image-20250301144546292.png)

Done!!

> If you run into other issues during deployment, check the community:
>
> 1. [Community](https://mx-space.js.org/docs/core/community)
> 2. [Additional notes for mainland China servers](https://yono233.xlog.app/24_7_12_jjzl?ref=cms.1900.live&locale=ja)

## Notes

If automatic certificate issuance keeps failing with network errors on a mainland China server, you can manually apply for a certificate from your domain registrar and upload it to Nginx Proxy Manager.

![certificate upload](https://yp.zinzin.cc//blog/image-20250302191136537.png)
