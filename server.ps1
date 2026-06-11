# Pure PowerShell Lightweight Web Server for Neon Breach
$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host "Neon Breach Web Server started successfully!"
    Write-Host "Access the game at: http://localhost:$port/"
    Write-Host "Press Ctrl+C in your console to stop the server."
} catch {
    Write-Host "Failed to start server: $_"
    exit
}

$baseDir = "C:\Users\Saahil\.gemini\antigravity\scratch\3d-fps-game"

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath
        if ($path -eq "/") {
            $path = "/index.html"
        }

        # Prevent directory traversal attacks
        $path = $path.Replace("../", "").Replace("..\", "")
        $filePath = Join-Path $baseDir $path

        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            # Set mime type
            if ($filePath.EndsWith(".html")) {
                $response.ContentType = "text/html; charset=utf-8"
            } elseif ($filePath.EndsWith(".css")) {
                $response.ContentType = "text/css; charset=utf-8"
            } elseif ($filePath.EndsWith(".js")) {
                $response.ContentType = "application/javascript; charset=utf-8"
            } else {
                $response.ContentType = "application/octet-stream"
            }

            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errorMessage = "404 - File Not Found"
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes($errorMessage)
            $response.ContentType = "text/plain"
            $response.ContentLength64 = $errBytes.Length
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
    } catch {
        # Silent fail for transient connection drops
    } finally {
        if ($null -ne $response) {
            try {
                $response.Close()
            } catch {}
        }
    }
}
