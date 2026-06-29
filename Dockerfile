# Sử dụng Python base image chính thức bản nhẹ (slim)
FROM python:3.10-slim

# Thiết lập thư mục làm việc trong container
WORKDIR /app

# Cài đặt các công cụ hệ thống cần thiết (nếu có)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements.txt và cài đặt dependencies trước để tối ưu cache của Docker
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ mã nguồn vào container
COPY . .

# Khai báo các biến môi trường mặc định
ENV FLASK_PORT=5000
ENV FLASK_HOST=0.0.0.0

# Mở cổng 5000 ngoài container
EXPOSE 5000

# Khởi chạy ứng dụng bằng Gunicorn (1 worker để tránh lặp luồng Telegram báo cáo)
CMD ["gunicorn", "--workers", "1", "--bind", "0.0.0.0:5000", "app:app"]

