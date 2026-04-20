#!/bin/bash
set -e

echo "=== Stoloto VIP Opencase — Setup ==="

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 not found"
    exit 1
fi

# Create venv if not exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple

# Install dependencies
echo "Installing dependencies from requirements.txt..."
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# Initialize database
echo "Seeding demo data..."
python seed.py

echo ""
echo "✅ Setup complete!"
echo ""
echo "To run the server:"
echo "  source venv/bin/activate"
echo "  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
echo ""
echo "Then open: http://localhost:8000/frontend/index.html"
