const { Pool } = require('pg');
require('dotenv').config(); // Подключение dotenv

// Настройка подключения к базе данных
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function updateDate(client) {
    // Получаем текущую дату
    const currentDate = new Date();

    // Проверяем, есть ли записи в таблице
    const result = await client.query('SELECT current_date_value FROM date_table');

    if (result.rows.length === 0) {
        // Если таблица пустая, вставляем текущую дату
        await client.query('INSERT INTO date_table (current_date_value) VALUES ($1)', [currentDate]);
        console.log('Дата установлена:', currentDate.toISOString().split('T')[0]);
    } else {
        // Обновляем записи, если дата меньше текущей
        
        for (const row of result.rows) {
            let dbDate = new Date(row.current_date_value);
            dbDate = new Date(dbDate.setDate(dbDate.getDate() + 1));
            if (dbDate.toISOString().split('T')[0] < currentDate.toISOString().split('T')[0]) {
                try {
                    // Получаем все товары
                    const res = await pool.query('SELECT id, quantity FROM products');
                    const products = res.rows;
                    console.log("Произошла поставка товаров");
                    // Обновляем количество для каждого товара
                    for (const product of products) {
                        const randomIncrease = Math.floor(Math.random() * 11); // Случайное число от 0 до 10
                        const newQuantity = product.quantity + randomIncrease;
            
                        await pool.query('UPDATE products SET quantity = $1 WHERE id = $2', [newQuantity, product.id]);
                        console.log(`Количество Товара ID ${product.id} увеличено на ${randomIncrease}. Новое количество: ${newQuantity}`);
                    }
                } catch (error) {
                    console.error('Ошибка при обновлении количества товаров:', error);
                } 
                await client.query('UPDATE date_table SET current_date_value = $1 WHERE current_date_value = $2', [currentDate, row.current_date_value]);
                console.log('Дата обновлена:', currentDate.toISOString().split('T')[0]);
            }
            break;
        }
    }
}

// Функция для инициализации базы данных
async function initDatabase() {
    // Проверка, нужно ли инициализировать базу данных
    if (process.env.INIT_DB !== 'true') {
        console.log('Инициализация базы данных пропущена.');
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Создание таблицы products
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                quantity INT NOT NULL
            );
        `);

        // Создание таблицы orders
        await client.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                customer_name VARCHAR(255) NOT NULL,
                order_date DATE NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'создан'
            );
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS date_table (
                current_date_value DATE NOT NULL
            );
        `);

        const products = [
            { id: 1, name: 'Смартфон', quantity: 50 },
            { id: 2, name: 'Ноутбук', quantity: 30 },
            { id: 3, name: 'Планшет', quantity: 20 },
            { id: 4, name: 'Наушники', quantity: 100 },
            { id: 5, name: 'Электронная книга', quantity: 15 },
            { id: 6, name: 'Умные часы', quantity: 25 },
            { id: 7, name: 'Телевизор', quantity: 10 },
            { id: 8, name: 'Камера', quantity: 5 },
            { id: 9, name: 'Игровая консоль', quantity: 8 },
            { id: 10, name: 'Портативная колонка', quantity: 40 },
        ];
    
        try {
            for (const product of products) {
                // Проверяем, существует ли товар с таким id
                const res = await client.query('SELECT * FROM products WHERE id = $1', [product.id]);
                if (res.rows.length === 0) {
                    // Если товар не существует, вставляем его
                    await client.query('INSERT INTO products (id, name, quantity) VALUES ($1, $2, $3)', [product.id, product.name, product.quantity]);
                    console.log(`Товар "${product.name}" добавлен с id ${product.id} и количеством ${product.quantity}.`);
                } else {
                    console.log(`Товар с id ${product.id} уже существует. Пропускаем.`);
                }
            }
        } catch (error) {
            console.error('Ошибка при вставке товаров:', error);
        }

        // Создание таблицы order_items
        await client.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INT REFERENCES orders(id) ON DELETE CASCADE,
                product_id INT REFERENCES products(id),
                quantity INT NOT NULL
            );
        `);

        await updateDate(client);

        await client.query('COMMIT');
        console.log('База данных инициализирована успешно.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ошибка инициализации базы данных:', error);
    } finally {
        client.release();
    }
}

// Экспорт функции инициализации
module.exports = {
    initDatabase,
    updateDate
};