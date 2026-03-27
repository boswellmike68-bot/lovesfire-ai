$body = Get-Content -Raw 'test_request.json'
Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/render' -ContentType 'application/json' -Body $body -OutFile 'test_output.mp4'
Write-Host "Done. Check test_output.mp4"
