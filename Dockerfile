# Python base image
FROM python:3.10-slim

# Working directory set karein
WORKDIR /app

# Scraper folder se requirements copy karke install karein
COPY scraper/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Poora scraper code copy karein
COPY scraper/ .

# Output logging fix
ENV PYTHONUNBUFFERED=1

# Scraper start command
CMD ["python", "cricket_scraper.py"]
