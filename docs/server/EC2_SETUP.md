Instance Type: t3.small

OS: Ubuntu 22.04 LTS

Key Pair Used: expensease.pem

Repo Access: Private GitHub repository

# CONNECT TO REPOSITORY

# ROOT ACCESS
sudo -s

# CLONE REPO
git clone https://<username>:<token>@github.com/<username>/<repo>.git

# OPEN REPO
cd expensease

# INSTALL NODE & CERTBOT
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
sudo apt install certbot -y

# OPEN DNS PROVIDER (GODADDY)

Domain: expensease.in
DNS record
Add DNS record
	Type: A	
	Name: api	
	Data: <public ip of ec2 server>


## EC2 SERVER (inside expensease folder)
# download ceritificate to connect to custom domain over dns
<!-- Ensure the server's Security Group has inbound rules for HTTP 80 -->
sudo certbot certonly --standalone -d api.expensease.in

# set environment variables and connect to above certificate
touch ecosystem.config.js
vim ecosystem.config.js


const sslfolder = "/etc/letsencrypt/live/api.expensease.in";
module.exports = {
  apps: [
    {
      script: "node ./bin/www",
      name: "server",
      env: {
        PORT: "80",
        SECURE_PORT: "443",
        SSL: "1",
        PEM: `${sslfolder}/privkey.pem`,
        CHAIN: `${sslfolder}/chain.pem`,
        CERT: `${sslfolder}/cert.pem`,
        MODE: "PROD",
        MONGO_URI:'<>',
        JWT_SECRET:'<>',
        GOOGLE_CLIENT_ID:'<>',
      },
    },
  ],
};

Press 'Esc' + Type ':wq' or ':wq!' if needed to close vim file

# INSTALL PM2
sudo npm install -g pm2

# START PM2
pm2 start ecosystem.config.js



