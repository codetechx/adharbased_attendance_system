<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AadhaarService
{
    private string $pdfServiceUrl;

    public function __construct()
    {
        $this->pdfServiceUrl = config('services.pdf_service.url', env('PDF_SERVICE_URL', 'http://pdf-service:8001'));
    }

    /**
     * Send the PDF to the Python microservice for parsing.
     * Returns structured Aadhaar data.
     */
    public function extractFromPdf(string $pdfPath, ?string $password = null): array
    {
        try {
            $response = Http::timeout(60)
                ->attach('pdf', file_get_contents($pdfPath), 'aadhaar.pdf')
                ->post("{$this->pdfServiceUrl}/extract", [
                    'password' => $password ?? '',
                ]);

            if ($response->failed()) {
                $body = $response->json();
                return [
                    'success' => false,
                    'message' => $body['detail'] ?? 'PDF extraction failed.',
                    'code'    => $body['code'] ?? 'PDF_ERROR',
                ];
            }

            $data = $response->json();

            return [
                'success' => true,
                'data'    => $this->sanitizeExtractedData($data),
            ];

        } catch (\Exception $e) {
            Log::error('Aadhaar PDF extraction failed', [
                'error' => $e->getMessage(),
            ]);

            return [
                'success' => false,
                'message' => 'Could not connect to PDF processing service. Please try again.',
                'code'    => 'SERVICE_UNAVAILABLE',
            ];
        }
    }

    /**
     * Sanitize and mask sensitive data before returning to frontend.
     */
    private function sanitizeExtractedData(array $data): array
    {
        // Mask the full Aadhaar number — only keep last 4 digits
        if (! empty($data['aadhaar_number'])) {
            $num = preg_replace('/\s+/', '', $data['aadhaar_number']);
            $data['aadhaar_number_masked'] = 'XXXX-XXXX-' . substr($num, -4);
            unset($data['aadhaar_number']); // never send raw Aadhaar number to frontend
        }

        return [
            'name'                  => $data['name'] ?? null,
            'dob'                   => $data['dob'] ?? null,
            'gender'                => $data['gender'] ?? null,
            'address'               => $data['address'] ?? null,
            'city'                  => $data['city'] ?? null,
            'state'                 => $data['state'] ?? null,
            'pin'                   => $data['pin'] ?? null,
            'aadhaar_number_masked' => $data['aadhaar_number_masked'] ?? null,
            'photo_base64'          => $data['photo_base64'] ?? null,
            'raw_text_available'    => ! empty($data['raw_text']),
        ];
    }
}
