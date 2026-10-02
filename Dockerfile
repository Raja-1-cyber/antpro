# Python base image specify karein
FROM python:3.10-slim

# Working directory set karein
WORKDIR /app

# Dependencies copy karke install karein
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Scraper code copy karein
COPY . .

# Environment variables (Railway se pass hongi)
ENV PYTHONUNBUFFERED=1

# Scraper run karne ki command
CMD ["python", "cricket_scraper.py"]
