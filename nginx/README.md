`docker build -t my-nginx .`
`docker run -p 8080:80 --rm -v .:/usr/share/nginx/html:ro my-nginx`
