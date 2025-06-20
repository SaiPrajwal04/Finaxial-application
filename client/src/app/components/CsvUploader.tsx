'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { CsvPreviewModal } from './CsvPreviewModal/CsvPreviewModal';
import { parseExcelFile } from '../utils/excelParser';
import styles from './CsvUploader.module.css';

interface FileData {
  content: string;
  file: File;
  type: 'csv' | 'excel';
}

interface CsvUploaderProps {
  onFileUpload: (filesContent: { content: string; fileName: string }[]) => void;
  isLoading: boolean;
}

export default function CsvUploader({ onFileUpload, isLoading }: CsvUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<FileData[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const handleConfirmUpload = useCallback(() => {
    if (uploadedFiles.length > 0) {
      const filesForUpload = uploadedFiles.map(file => ({
        content: file.content,
        fileName: file.file.name
      }));
      onFileUpload(filesForUpload);
      setShowPreview(false);
      setUploadedFiles([]);
    }
  }, [uploadedFiles, onFileUpload]);

  const handleCancelUpload = useCallback(() => {
    setShowPreview(false);
  }, []);
  
  const handleRemoveFile = useCallback((index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setError(null);
      
      // Filter supported files (CSV & Excel)
      const supportedFiles = acceptedFiles.filter(file => 
        file.type === 'text/csv' || 
        file.name.toLowerCase().endsWith('.csv') || 
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        file.name.toLowerCase().endsWith('.xlsx')
      );
      
      if (supportedFiles.length === 0) {
        setError('Please upload CSV or Excel (.xlsx) files only');
        return;
      }
      
      if (supportedFiles.length !== acceptedFiles.length) {
        setError('Some files were rejected. Only CSV and Excel (.xlsx) files are accepted.');
      }
      
      // Process each file
      Promise.all(supportedFiles.map(file => {
        const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                       file.name.toLowerCase().endsWith('.xlsx');
        
        return new Promise<FileData>((resolve, reject) => {
          const reader = new FileReader();
          
          reader.onload = () => {
            if (isExcel) {
              try {                // For Excel files
                const arrayBuffer = reader.result as ArrayBuffer;
                const excelData = parseExcelFile(arrayBuffer);
                
                // Combine data from all sheets into a single CSV
                // Start with the primary sheet data
                const primarySheetData = excelData.sheets[excelData.primarySheet];
                let csvContent = '';
                
                // If there's only one sheet, handle it simply
                if (Object.keys(excelData.sheets).length === 1) {
                  const headers = primarySheetData.headers.join(',');
                  const rows = primarySheetData.rows.map(row => row.join(','));
                  csvContent = [headers, ...rows].join('\n');
                } else {
                  // For multiple sheets, include sheet name in the data
                  const allSheetData: string[] = [];
                  
                  // Process each sheet
                  Object.entries(excelData.sheets).forEach(([sheetName, sheetData]) => {
                    if (sheetData.headers.length === 0) return; // Skip empty sheets
                    
                    // Add sheet name as a header row
                    allSheetData.push(`# Sheet: ${sheetName}`);
                    
                    // Add the headers and rows
                    const headers = sheetData.headers.join(',');
                    const rows = sheetData.rows.map(row => row.join(','));
                    allSheetData.push(headers, ...rows, ''); // Empty string for separator
                  });
                  
                  csvContent = allSheetData.join('\n');
                }
                
                resolve({ 
                  content: csvContent, 
                  file, 
                  type: 'excel' 
                });
              } catch (error) {
                reject(new Error(`Failed to parse Excel file: ${file.name}`));
              }
            } else {
              // For CSV files
              const fileContent = reader.result as string;
              resolve({ 
                content: fileContent, 
                file,
                type: 'csv' 
              });
            }
          };
          
          reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
          
          if (isExcel) {
            reader.readAsArrayBuffer(file);
          } else {
            reader.readAsText(file);
          }
        });
      }))
      .then(results => {
        setUploadedFiles(prev => [...prev, ...results]);
      })
      .catch(err => {
        setError(err.message);
      });
    },
    []
  );  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    multiple: true,
    disabled: isLoading,
    noClick: false,
    noKeyboard: false,
    noDrag: false,
    noDragEventsBubbling: false,
  });

  // We need to handle the drag events ourselves to make it work with motion.div
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (!isLoading && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      onDrop(Array.from(event.dataTransfer.files));
    }
  };
  return (
    <div className={styles.uploaderContainer}>
      {showPreview && uploadedFiles.length > 0 && (
        <CsvPreviewModal
          files={uploadedFiles}
          onConfirm={handleConfirmUpload}
          onCancel={handleCancelUpload}
        />
      )}
      <motion.div
        className={`${styles.dropzone} ${isDragActive ? styles.active : ''} ${isLoading ? styles.loading : ''}`}
        {...getRootProps({
          onClick: undefined, // We'll handle click separately to avoid conflicts
        })}
        onClick={!isLoading ? getRootProps().onClick : undefined}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <input {...getInputProps()} />

        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={styles.loadingIndicator}
            >
              <div className={styles.spinner}></div>
              <p>Analyzing your financial data...</p>
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={styles.uploadContent}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                className={styles.uploadIcon}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>              {uploadedFiles.length > 0 ? (
                <div className={styles.filesList}>                  <p className={styles.uploadedFilesTitle}>
                    {uploadedFiles.length} {uploadedFiles.length === 1 ? 'file' : 'files'} ready
                    <span className={styles.fileTypesInfo}>
                      ({uploadedFiles.filter(f => f.type === 'csv').length} CSV, {uploadedFiles.filter(f => f.type === 'excel').length} Excel)
                    </span>
                  </p>
                  <ul className={styles.fileNamesList}>
                    {uploadedFiles.slice(0, 3).map((file, index) => (
                      <li key={index} className={styles.fileNameItem}>
                        <span className={styles.fileName}>{file.file.name}</span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFile(index);
                          }}
                          className={styles.removeFileBtn}
                          aria-label={`Remove ${file.file.name}`}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                    {uploadedFiles.length > 3 && (
                      <li className={styles.moreFiles}>
                        +{uploadedFiles.length - 3} more {uploadedFiles.length - 3 === 1 ? 'file' : 'files'}
                      </li>
                    )}
                  </ul>
                  <p className={styles.dragMoreText}>Drag more files or click to browse</p>
                </div>
              ) : (                <>
                  <p className={styles.mainText}>
                    {isDragActive ? 'Drop your files here' : 'Drag & drop your CSV or Excel files here'}
                  </p>
                  <p className={styles.subText}>or click to browse (CSV and XLSX formats supported)</p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>      {error && (
        <motion.div
          className={styles.error}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {error}
        </motion.div>
      )}

      {uploadedFiles.length > 0 && (
        <motion.div 
          className={styles.generateButtonContainer}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button 
            className={styles.generateButton}
            onClick={() => setShowPreview(true)}
            disabled={isLoading}
          >
            Preview & Generate Insights
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.generateIcon}>
              <path d="M5 12h14"></path>
              <path d="M12 5l7 7-7 7"></path>
            </svg>
          </button>
        </motion.div>
      )}
    </div>
  );
}