Для запуска в контейнере
git clone https://github.com/DaniilShp/warehouse_informational_system_javascript_node_js.git
cd warehouse_informational_system_javascript_node_js
cp .env.example .env
sudo docker compose up  
Запустится контейнер с базой данных postgres (c записанными в docker-compose.yaml настройками, соответствующими .env.example) и контейнер с сервером

