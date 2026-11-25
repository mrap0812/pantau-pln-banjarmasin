cd /d "%~dp0"
curl -s -A "pantau-pln/1.0" --max-time 150 --data-urlencode "data@alat\sumber\q6.txt" https://overpass-api.de/api/interpreter -o alat\sumber\roads_yani2.json
python alat\bangun_geo.py
pause
