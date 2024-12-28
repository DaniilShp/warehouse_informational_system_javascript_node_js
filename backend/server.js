const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config(); 
const cors = require('cors');
const {initDatabase, updateDate} = require('./dbInit'); 
const app = express();

DEFAULT_PORT = 8081;
const PORT = process.env.PORT || DEFAULT_PORT;

app.use(cors());
app.use(bodyParser.json());

initDatabase();


const pool = new Pool({
    user: process.env.DB_USER, 
    host: process.env.DB_HOST, 
    database: process.env.DB_DATABASE, 
    password: process.env.DB_PASSWORD, 
    port: process.env.DB_PORT,
});

const noCache = (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
};

let notFormattedDate = new Date();
let currentDate = notFormattedDate.toISOString().split('T')[0];


app.use(express.static(path.join(__dirname, '../frontend')));


app.get('/', noCache, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// эндпоинт для получения списка товаров
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products');
        res.json(result.rows); // Отправляем массив товаров в ответе
    } catch (error) {
        console.error('Ошибка при получении списка товаров:', error);
        res.status(500).json({ error: 'Ошибка при получении списка товаров' });
    }
});

// Удаление заказов с истекшей датой
async function removeExpiredOrders() {
    // Получаем текущую дату из базы данных
    const dateResult = await pool.query(`
        SELECT current_date_value FROM date_table LIMIT 1
    `);
    
    // Извлекаем текущую дату
    const currentDate = dateResult.rows[0].current_date_value;

    // Выполняем обновление заказов и продуктов
    const result = await pool.query(`
        WITH cancelled_orders AS (
            UPDATE orders
            SET status = 'отменен'
            WHERE order_date < $1 AND status = 'создан'
            RETURNING id
        ),
        order_quantities AS (
            SELECT oi.product_id, SUM(oi.quantity) AS total_quantity
            FROM order_items oi
            JOIN cancelled_orders co ON oi.order_id = co.id
            GROUP BY oi.product_id
        )
        UPDATE products
        SET quantity = products.quantity + oq.total_quantity
        FROM order_quantities oq
        WHERE oq.product_id = products.id;
    `, [currentDate]);

    return result;
}

// Проверка наличия товара
async function checkProductAvailability(productId, quantity) {
    const res = await pool.query('SELECT quantity FROM products WHERE id = $1', [productId]);
    return res.rows.length > 0 && res.rows[0].quantity >= quantity;
}

app.get('/api/orders', noCache, async (req, res) => {
    // Получаем дату из параметров запроса
    const { date } = req.query;

    // Запрос для получения заказов с их позициями и названиями товаров
    let query = `
        SELECT o.id AS order_id, o.customer_name, o.order_date, o.status,
               p.name AS product_name, SUM(oi.quantity) AS total_quantity
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN products p ON oi.product_id = p.id
    `;
    const queryParams = [];

    // Если дата передана, добавляем условие WHERE
    if (date) {
        query += ' WHERE DATE(o.order_date) = $1';
        queryParams.push(date);
    }

    // Группируем по заказу и названию товара
    query += ' GROUP BY o.id, p.name';

    try {
        const result = await pool.query(query, queryParams);
        // Группируем результаты по заказам
        const orders = result.rows.reduce((acc, row) => {
            const { order_id, customer_name, order_date, status, product_name, total_quantity } = row;

            // Проверяем, существует ли уже заказ в аккумуляторе
            let order = acc.find(o => o.id === order_id);
            if (!order) {
                order = {
                    id: order_id,
                    customer_name,
                    order_date,
                    status, // Добавляем статус заказа
                    items: []
                };
                acc.push(order);
            }

            // Если есть товар, добавляем его в список позиций заказа
            if (product_name) {
                order.items.push({
                    product_name,
                    quantity: total_quantity
                });
            }

            return acc;
        }, []);

        res.json(orders);
    } catch (error) {
        console.error('Ошибка при получении заказов:', error);
        res.status(500).json({ error: 'Ошибка при получении заказов' });
    }
});


// Добавление нового заказа
app.post('/api/orders', async (req, res) => {
    const { customerName, orderDate, items } = req.body;
    date = new Date(orderDate);
    date.setDate(orderDate.getDate + 1);
    if (date < currentDate) {
        return res.status(400).json({ message: 'Дата заказа не может быть меньше текущей даты.' });
    }
    const newOrder = await pool.query(
        'INSERT INTO orders (customer_name, order_date) VALUES ($1, $2) RETURNING *',
        [customerName, orderDate]
    );

    res.status(201).json(newOrder.rows[0]);
});

app.delete('/api/orders/:id', async (req, res) => {
    const orderId = req.params.id;
  
    const client = await pool.connect(); // Получаем клиент для работы с транзакцией
    try {
      await client.query('BEGIN'); // Начинаем транзакцию
      console.log(`Начало удаления заказа с ID: ${orderId}`);
  
      // Получаем все товары из заказа
      const orderItemsQuery = 'SELECT product_id, quantity FROM order_items WHERE order_id = $1';
      const orderItemsRes = await client.query(orderItemsQuery, [orderId]);
  
      // Возвращаем товары на склад
      for (const item of orderItemsRes.rows) {
        const { product_id, quantity } = item;
  
        // Получаем текущее количество товара
        const productQuery = 'SELECT quantity FROM products WHERE id = $1';
        const productRes = await client.query(productQuery, [product_id]);
  
        if (productRes.rows.length > 0) {
          const availableQuantity = productRes.rows[0].quantity;
  
          // Обновляем количество товара
          await client.query('UPDATE products SET quantity = $1 WHERE id = $2', [availableQuantity + quantity, product_id]);
          console.log(`Возвращено ${quantity} единиц товара с ID: ${product_id} на склад.`);
        }
      }
  
      // Удаляем заказ
      await client.query('DELETE FROM orders WHERE id = $1', [orderId]);
      console.log(`Заказ с ID: ${orderId} успешно удален.`);
  
      await client.query('COMMIT'); // Подтверждаем транзакцию
      res.status(204).send();
    } catch (error) {
      await client.query('ROLLBACK'); // Откатываем транзакцию в случае ошибки
      console.error(`Ошибка при удалении заказа с ID: ${orderId} - ${error.message}`);
      res.status(500).send('Ошибка при удалении заказа');
    }
});

app.delete('/api/orders', async (req, res) => {
    try {
        await removeExpiredOrders();
        res.status(204).send();
    } catch (error) {
        res.status(500).send({"message": "ошибка"});
    }

});

// Эндпоинт для обновления статуса заказов
app.put('/api/orders', async (req, res) => {
    const { status } = req.body; // Получаем статус из тела запроса

    if (!status) {
        return res.status(400).json({ message: 'Статус не указан.' });
    }

    try {
        // Получаем текущую дату из таблицы date_table
        const dateResult = await pool.query(
            `SELECT current_date_value FROM date_table LIMIT 1`
        );

        if (dateResult.rows.length === 0) {
            return res.status(500).json({ message: 'Текущая дата не найдена в базе данных.' });
        }

        const currentDate = dateResult.rows[0].current_date_value; // Получаем текущую дату

        // Обновляем статус заказов с текущей датой
        const result = await pool.query(
            `UPDATE orders
             SET status = $1
             WHERE order_date = $2`,
            [status, currentDate]
        );

        // Проверяем, были ли обновлены какие-либо записи
        if (result.rowCount > 0) {
            res.status(201).json({ message: `Статус заказов обновлен на "${status}".` });
        } else {
            res.status(201).json({ message: 'Заказы с текущей датой не найдены.' });
        }
    } catch (error) {
        console.error('Ошибка при обновлении статуса заказов:', error);
        res.status(500).json({ message: 'Ошибка сервера.' });
    }
});

// Функция для увеличения количества товаров
async function increaseProductQuantities() {
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
}

// Переключение текущей даты на день вперед
app.post('/api/get_delivery', async (req, res) => {
    const { orderDate } = req.body;
    increaseProductQuantities();
    res.json({ currentDate });
});

// добавление позиции в заказ
app.post('/api/positions', async (req, res) => {
    const { productId, quantity, selectedOrderId } = req.body;
    if (selectedOrderId === null) {
        return res.status(400).json({ message: 'не выбран заказ' });
    }
    const query_for_quantity = 'SELECT quantity FROM products WHERE id = $1';
    const result = await pool.query(query_for_quantity, [productId]);

    // Проверка, существует ли товар
    if (result.rows.length === 0) {
        return res.status(400).json({message: 'Товар не найден'});
    }

    const availableQuantity = result.rows[0].quantity;

    // Проверка, достаточно ли товара на складе
    if (availableQuantity < quantity) {
        console.log('Недостаточно товара на складе');
        return res.status(400).json({message: 'Недостаточно товара на складе'});
    }

    pool.query(`UPDATE products SET quantity = $1 WHERE id = $2`, [(availableQuantity-quantity), productId]);
    console.log(`Доступное количество товара: ${availableQuantity}-${quantity}=${availableQuantity-quantity}`);

    // Выполняем запрос на добавление товара в заказ
    const query_for_order_position = `
        INSERT INTO order_items (order_id, product_id, quantity)
        VALUES ($1, $2, $3)
    `;
    const values = [selectedOrderId, productId, quantity];

    await pool.query(query_for_order_position, values);
    console.log(`Товар Id: ${productId} добавлен в заказ Id: ${selectedOrderId}`);

    res.json({ currentDate });
});

// Эндпоинт для удаления позиции из заказа
app.delete('/api/positions/:orderId/:productId', async (req, res) => {
    const { orderId, productId } = req.params;

    try {
        await pool.query('BEGIN'); // Начинаем транзакцию

        // Получаем количество удаляемой позиции
        const positionQuery = 'SELECT quantity FROM order_items WHERE order_id = $1 AND product_id = $2';
        const positionRes = await pool.query(positionQuery, [orderId, productId]);

        if (positionRes.rows.length > 0) {
            const quantity = positionRes.rows[0].quantity;

            // Возвращаем товар на склад
            const productQuery = 'SELECT quantity FROM products WHERE id = $1';
            const productRes = await pool.query(productQuery, [productId]);

            if (productRes.rows.length > 0) {
                const availableQuantity = productRes.rows[0].quantity;
                await pool.query('UPDATE products SET quantity = $1 WHERE id = $2', [availableQuantity + quantity, productId]);
                console.log(`Возвращено ${quantity} единиц товара с ID: ${productId} на склад.`);
            }

            // Удаляем позицию из заказа
            await pool.query('DELETE FROM order_items WHERE order_id = $1 AND product_id = $2', [orderId, productId]);
            console.log(`Позиция заказа с ID: ${orderId} и товаром: ${productId} успешно удалена.`);
        } else {
            console.log(`Позиция заказа с ID: ${orderId} и товаром: ${productId} не найдена.`);
            return res.status(400).send({message: 'Позиция не найдена в выбранном заказе'});
        }

        await pool.query('COMMIT'); // Подтверждаем транзакцию
        res.status(204).send(); // Успешное удаление
    } catch (error) {
        await pool.query('ROLLBACK'); // Откатываем транзакцию в случае ошибки
        console.error(`Ошибка при удалении позиции заказа: ${error.message}`);
        return res.status(500).send('Ошибка при удалении позиции заказа');
    }
});

// Эндпоинт для инициализации даты сегодняшним значением
app.post('/api/date', async (req, res) => {
    try {
        const today = new Date(Date.now()); // Получаем текущее время
        
        const formattedDate = today.toISOString().split('T')[0]; // Получаем только дату в формате YYYY-MM-DD

        await pool.query('insert into date_table (current_date_value) values ($1)', [formattedDate]);
        res.status(201).send('Дата инициализирована сегодняшним значением.');
    } catch (error) {
        console.error('Ошибка при инициализации даты:', error);
        res.status(500).send('Ошибка при инициализации даты.');
    }
});

app.get('/api/date', noCache, async (req, res) => {
    await updateDate(pool);
    try {
        let result = await pool.query('SELECT current_date_value FROM date_table');
        if (result.rows.length > 0) {
            const response_with_date = result.rows[0].current_date_value;
            let date = new Date(response_with_date);
            date = date.setDate(date.getDate() + 1);
            res.status(200).send(new Date(date).toISOString().split('T')[0].toString());
        } else {
            console.error('Нет данных в таблице date_table');
            res.status(404).send('Нет данных для отображения.');
        }
    } catch (error) {
        console.error('Ошибка при получении даты:', error);
        res.status(500).send('Ошибка при получении даты.');
    }
});

// Эндпоинт для сдвига даты на следующий день
app.put('/api/date', async (req, res) => {
    try {
        const result = await pool.query('SELECT current_date_value FROM date_table LIMIT 1');
        if (result.rows.length > 0) {
            const currentDate = result.rows[0].current_date_value;
            let nextDate = new Date(currentDate);
            nextDate = nextDate.setDate(nextDate.getDate() + 1); // Сдвигаем дату на один день
            nextDate = new Date(nextDate);
            await pool.query('UPDATE date_table SET current_date_value = $1', [nextDate]);
            nextDate = nextDate.setDate(nextDate.getDate() + 1);
            res.send({"currentDate": new Date(nextDate + 1).toISOString().split('T')[0].toString()});
        } else {
            res.status(404).send('Дата не найдена.');
        }
    } catch (error) {
        console.error('Ошибка при сдвиге даты:', error);
        res.status(500).send('Ошибка при сдвиге даты.');
    }
});

// Обработка завершения работы сервера
const shutdown = async () => {
    console.log('Закрытие пула соединений...');
    await pool.end(); // Закрываем пул соединений
    console.log('Пул соединений закрыт.');
    process.exit(0); // Завершаем процесс
};

// Обработка сигналов завершения
process.on('SIGINT', shutdown); // Обработка Ctrl+C
process.on('SIGTERM', shutdown); // Обработка сигнала завершения

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});
