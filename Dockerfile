# Use a imagem oficial do Nginx
FROM nginx:alpine

# Copie o conteúdo do diretório atual para o diretório padrão do Nginx
COPY . /usr/share/nginx/html

# Exponha a porta 80
EXPOSE 80
